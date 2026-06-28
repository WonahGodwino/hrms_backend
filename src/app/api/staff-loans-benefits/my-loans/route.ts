import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])

    // "My Loans" is always the user's OWN, personal view, scoped to the company
    // they were registered into — never the currently-selected/assigned company.
    //
    // The JWT `userId` is the StaffRecord id the user logged in with, so its
    // companyId is the registered/home company. An ADMIN or SUPER_ADMIN with
    // access to many companies can still only borrow from their own company, so
    // we deliberately ignore their assigned/scoped companies here.
    let staffRecord = user.userId
      ? await prisma.staffRecord.findUnique({
          where: { id: user.userId },
          select: { id: true, companyId: true, firstName: true, lastName: true, email: true, isActive: true },
        })
      : null

    // Fallback for older tokens that don't carry a staff-record userId: a unique
    // email match is safe; an email shared across companies is intentionally not
    // resolved (we can't tell which is the registered company).
    if (!staffRecord) {
      const matches = await prisma.staffRecord.findMany({
        where: { email: user.email, isActive: true },
        select: { id: true, companyId: true, firstName: true, lastName: true, email: true, isActive: true },
      })
      if (matches.length === 1) {
        staffRecord = matches[0]
      }
    }

    if (!staffRecord || !staffRecord.isActive) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    const staffId = staffRecord.id
    const companyId = staffRecord.companyId

    // Fetch employee salary
    let employeeSalary = 0
    let employeeNetSalary = 0

    const latestPayPeriod = await prisma.payroll.findFirst({
      where: { staffRecordId: staffId, status: 'PROCESSED' },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { year: true, month: true },
    })

    if (latestPayPeriod) {
      const monthPayrolls = await prisma.payroll.findMany({
        where: {
          staffRecordId: staffId,
          status: 'PROCESSED',
          year: latestPayPeriod.year,
          month: latestPayPeriod.month,
        },
        select: {
          netSalary: true,
          grossPay: true,
          customFields: true,
          templateType: true,
        },
      })

      let totalNet = 0

      for (const p of monthPayrolls) {
        if (p.templateType && p.templateType !== 'ISURF_STANDARD' && p.customFields) {
          const cf = p.customFields as Record<string, any>
          let customNet = 0
          for (const key of Object.keys(cf)) {
            const field = cf[key]
            if (field && typeof field === 'object' && 'value' in field) {
              const val = Number(field.value)
              if (!isNaN(val) && val > 0 &&
                (field.section === 'NET' || key === 'net_salary' || key === 'take_home' ||
                  key === 'net_pay' || key.includes('net_salary') || key.includes('take_home'))) {
                customNet = val
                break
              }
            }
          }
          totalNet += customNet || Number(p.netSalary || p.grossPay || 0)
        } else {
          totalNet += Number(p.netSalary || 0)
        }
      }

      employeeSalary = totalNet
      employeeNetSalary = totalNet
    }

    // Fetch all records in parallel before computing derived data
    const [myLoanRequests, myBenefitRequests, myBenefitAllocations, company] = await Promise.all([
      prisma.loanRequest.findMany({
        where: { companyId, staffId },
        include: {
          staff: { select: { firstName: true, lastName: true, email: true, department: true } },
          approver: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.benefitRequest.findMany({
        where: { companyId, staffId },
        include: {
          staff: { select: { firstName: true, lastName: true, email: true, department: true } },
          approver: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.benefitAllocation.findMany({
        where: { companyId, staffId },
        include: {
          staff: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { baseCurrency: true },
      }),
    ])

    const baseCurrency = company?.baseCurrency || 'NGN'

    // Build myLoans from LoanRequest records (accurate principal, rate, tenure, monthly payment)
    const myLoans = myLoanRequests.map((lr) => {
      const P = Number(lr.requestedAmount)
      const rate = Number(lr.interestRate ?? 0) / 100 / 12
      const n = lr.tenureMonths ?? 12
      const monthlyPayment =
        Number(lr.monthlyRepayment ?? 0) ||
        (rate > 0 ? (P * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1) : P / n)
      const startDate = lr.approvedAt ?? lr.createdAt
      const monthsElapsed = Math.min(
        n,
        Math.max(0, Math.floor((Date.now() - new Date(startDate).getTime()) / (30.44 * 86400000)))
      )
      let balance = P
      for (let i = 0; i < monthsElapsed; i++) {
        const interest = balance * rate
        balance = Math.max(0, balance - (monthlyPayment - interest))
      }
      const pctPaid = P > 0 ? Math.min(100, Math.round(((P - balance) / P) * 100)) : 0
      const displayStatus =
        lr.status === 'APPROVED' || lr.status === 'DISBURSED' ? 'ACTIVE'
        : lr.status === 'REPAID' ? 'COMPLETED'
        : lr.status === 'DEFAULTED' ? 'DEFAULTED'
        : (lr.status as string)
      return {
        id: lr.id,
        staffId: lr.staffId,
        employeeName: `${lr.staff.firstName} ${lr.staff.lastName}`.trim(),
        employeeEmail: lr.staff.email,
        loanType: lr.loanType,
        amountIssued: P,
        amountRepaid: P - balance,
        outstandingBalance: balance,
        monthlyDeduction: monthlyPayment,
        progressPercent: pctPaid,
        status: displayStatus,
      }
    })

    // Map loan requests
    const loanRequests = myLoanRequests.map((lr) => ({
      id: lr.id,
      requestCategory: 'LOAN',
      requestType: 'LOAN' as const,
      status: lr.status,
      employeeName: `${lr.staff.firstName} ${lr.staff.lastName}`.trim(),
      employeeEmail: lr.staff.email,
      title: `${lr.loanType} request`,
      amount: Number(lr.requestedAmount),
      approvedAmount: lr.approvedAmount ? Number(lr.approvedAmount) : null,
      tenureMonths: lr.tenureMonths,
      interestRate: Number(lr.interestRate || 0),
      createdAt: lr.createdAt.toISOString(),
      reviewedAt: lr.approvedAt?.toISOString() || null,
      reviewerComment: lr.approvalComment || lr.rejectionReason || null,
      approverName: lr.approver ? `${lr.approver.firstName} ${lr.approver.lastName}`.trim() : null,
      guarantorStatus: (lr as any).guarantorStatus || 'NOT_REQUIRED',
      disbursedAt: (lr as any).disbursedAt?.toISOString() || null,
    }))

    // Map benefit requests
    const benefitRequests = myBenefitRequests.map((br) => ({
      id: br.id,
      requestCategory: 'BENEFIT',
      requestType: 'BENEFIT' as const,
      status: br.status,
      employeeName: `${br.staff.firstName} ${br.staff.lastName}`.trim(),
      employeeEmail: br.staff.email,
      title: `${br.benefitName} request`,
      benefitName: br.benefitName,
      amount: 0,
      createdAt: br.createdAt.toISOString(),
      reviewedAt: br.approvedAt?.toISOString() || null,
      reviewerComment: br.approvalComment || br.rejectionReason || null,
      approverName: br.approver ? `${br.approver.firstName} ${br.approver.lastName}`.trim() : null,
    }))

    // Map benefit allocations
    const benefitAllocations = myBenefitAllocations.map((ba) => ({
      id: ba.id,
      requestCategory: 'ALLOCATION',
      requestType: 'ALLOCATION' as const,
      status: ba.status || 'ALLOCATED',
      employeeName: `${ba.staff.firstName} ${ba.staff.lastName}`.trim(),
      employeeEmail: ba.staff.email,
      title: `${ba.benefitName} allocation`,
      benefitName: ba.benefitName,
      amount: Number(ba.allocationAmount),
      createdAt: ba.createdAt.toISOString(),
      reviewedAt: null,
      reviewerComment: null,
      approverName: null,
    }))

    return withCors(
      ApiResponse.success(
        {
          staffRecord: {
            id: staffRecord.id,
            name: `${staffRecord.firstName} ${staffRecord.lastName}`.trim(),
            email: staffRecord.email,
            companyId,
          },
          baseCurrency,
          employeeSalary,
          employeeNetSalary,
          myLoans,
          loanRequests,
          benefitRequests,
          benefitAllocations,
        },
        'My loans and benefits data fetched successfully'
      ),
      origin
    )
  } catch (error) {
    console.error('[MyLoans GET]', error)
    return withCors(handleApiError(error), origin)
  }
}