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

    // Always find the user's own staff record by email — never fall back to company-wide data
    const staffRecord = await prisma.staffRecord.findFirst({
      where: { email: user.email, isActive: true },
      select: { id: true, companyId: true, firstName: true, lastName: true, email: true },
    })

    if (!staffRecord) {
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
          grossPay: true,
          basicSalary: true,
          housing: true,
          transport: true,
          dressing: true,
          leaveAllowance: true,
          entertainment: true,
          utility: true,
          otherAllowance: true,
          communicationAllowance: true,
          transportationAllowance: true,
          overtimeIncome: true,
          customFields: true,
          templateType: true,
        },
      })

      let totalGross = 0
      let totalBasePay = 0

      for (const p of monthPayrolls) {
        if (p.templateType && p.templateType !== 'ISURF_STANDARD' && p.customFields) {
          const cf = p.customFields as Record<string, any>
          let earnings = 0
          let basePay = 0
          for (const key of Object.keys(cf)) {
            const field = cf[key]
            if (field && typeof field === 'object' && 'value' in field) {
              const val = Number(field.value)
              if (!isNaN(val)) {
                if (field.section === 'EARNINGS' || key === 'base_pay' || key.includes('salary') || key.includes('bonus')) {
                  earnings += val
                }
                if (key === 'base_pay' || key.includes('basic_salary')) {
                  basePay = val
                }
              }
            }
          }
          totalGross += (earnings || Number(p.grossPay || 0))
          totalBasePay += (basePay || Number(p.basicSalary || 0))
        } else {
          const gross =
            Number(p.grossPay || 0) ||
            Number(p.basicSalary || 0) +
            Number(p.housing || 0) +
            Number(p.transport || 0) +
            Number(p.dressing || 0) +
            Number(p.leaveAllowance || 0) +
            Number(p.entertainment || 0) +
            Number(p.utility || 0) +
            Number(p.otherAllowance || 0) +
            Number(p.communicationAllowance || 0) +
            Number(p.transportationAllowance || 0) +
            Number(p.overtimeIncome || 0)
          totalGross += gross
          totalBasePay += Number(p.basicSalary || 0)
        }
      }

      employeeSalary = totalGross
      employeeNetSalary = totalBasePay
    }

    // Fetch loan deduction entries — only for THIS staff
    const deductionEntries = await prisma.deductionEntry.findMany({
      where: {
        companyId,
        staffId,
        deductionType: { in: ['LOAN', 'SALARY_ADVANCE'] },
      },
      include: {
        staff: {
          select: { id: true, firstName: true, lastName: true, email: true, department: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Aggregate loans from deductions
    const aggregatedByLoan = new Map()
    deductionEntries.forEach((entry) => {
      const deductionAmount = Number(entry.amount || 0)
      const loanKey = `${entry.staffId}:${entry.deductionType}`
      const existing = aggregatedByLoan.get(loanKey)
      if (!existing) {
        const impliedAmountIssued = deductionAmount * 12
        const progressPercent = Math.min(100, Math.round((deductionAmount / Math.max(impliedAmountIssued, 1)) * 100))
        aggregatedByLoan.set(loanKey, {
          id: `LN-${entry.staffId.slice(-4)}-${entry.id.slice(-4)}`,
          staffId: entry.staffId,
          employeeName: `${entry.staff.firstName} ${entry.staff.lastName}`.trim(),
          employeeEmail: entry.staff.email,
          loanType: entry.deductionType === 'LOAN' ? 'Loan Repayment' : 'Salary Advance',
          amountIssued: impliedAmountIssued,
          amountRepaid: deductionAmount,
          outstandingBalance: Math.max(0, impliedAmountIssued - deductionAmount),
          monthlyDeduction: deductionAmount,
          progressPercent,
          status: progressPercent >= 100 ? 'COMPLETED' : 'ACTIVE',
        })
        return
      }
      existing.amountRepaid += deductionAmount
      existing.monthlyDeduction = Math.max(existing.monthlyDeduction, deductionAmount)
      existing.outstandingBalance = Math.max(0, existing.amountIssued - existing.amountRepaid)
      existing.progressPercent = Math.min(100, Math.round((existing.amountRepaid / Math.max(existing.amountIssued, 1)) * 100))
      existing.status = existing.progressPercent >= 100 ? 'COMPLETED' : 'ACTIVE'
    })

    const myLoans = Array.from(aggregatedByLoan.values())

    // Fetch my loan requests
    const myLoanRequests = await prisma.loanRequest.findMany({
      where: { companyId, staffId },
      include: {
        staff: { select: { firstName: true, lastName: true, email: true, department: true } },
        approver: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Fetch my benefit requests
    const myBenefitRequests = await prisma.benefitRequest.findMany({
      where: { companyId, staffId },
      include: {
        staff: { select: { firstName: true, lastName: true, email: true, department: true } },
        approver: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Fetch my benefit allocations
    const myBenefitAllocations = await prisma.benefitAllocation.findMany({
      where: { companyId, staffId },
      include: {
        staff: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Fetch company currency
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { baseCurrency: true },
    })
    const baseCurrency = company?.baseCurrency || 'NGN'

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