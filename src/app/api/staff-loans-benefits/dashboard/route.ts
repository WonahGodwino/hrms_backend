import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

type LoanStatus = 'ACTIVE' | 'OVERDUE' | 'DEFAULTED' | 'COMPLETED'
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

type AggregatedLoan = {
  id: string
  staffId: string
  employeeName: string
  employeeEmail: string
  loanType: string
  amountIssued: number
  amountRepaid: number
  outstandingBalance: number
  monthlyDeduction: number
  nextPaymentDate: string
  status: LoanStatus
  riskLevel: RiskLevel
  progressPercent: number
}

type ModuleRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

type ModuleRequestRecord = {
  id: string
  requestType: 'LOAN' | 'BENEFIT' | 'ALLOCATION'
  status: ModuleRequestStatus
  employeeName: string
  employeeEmail: string
  title: string
  amount?: number
  tenureMonths?: number
  benefitName?: string
  createdAt: string
  reviewedAt?: string | null
  reviewerComment?: string | null
}


function toNaira(amount: number): string {
  return `N${amount.toLocaleString('en-NG')}`
}

function deriveLoanStatus(ageInDays: number, progressPercent: number): LoanStatus {
  if (progressPercent >= 100) return 'COMPLETED'
  if (ageInDays > 270 && progressPercent < 55) return 'DEFAULTED'
  if (ageInDays > 150 && progressPercent < 75) return 'OVERDUE'
  return 'ACTIVE'
}

function deriveRiskLevel(status: LoanStatus, outstandingRatio: number): RiskLevel {
  if (status === 'DEFAULTED' || outstandingRatio >= 0.7) return 'HIGH'
  if (status === 'OVERDUE' || outstandingRatio >= 0.45) return 'MEDIUM'
  return 'LOW'
}

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

    const { searchParams } = new URL(request.url)
    const requestedCompanyId = searchParams.get('companyId')
    const personalScope = searchParams.get('personalScope') === 'true'

    let scopedCompanyIds: string[] = []

    // Personal scope: ADMIN/HR view their own staff_record company loans, not the operational company
    if (personalScope && (user.role === 'ADMIN' || user.role === 'HR')) {
      const ownStaffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true },
        select: { companyId: true },
      })
      if (ownStaffRecord) {
        scopedCompanyIds = [ownStaffRecord.companyId]
      } else {
        // HR/ADMIN may not have a staff record — fall back to assigned companies
        const assignments = await prisma.userCompany.findMany({
          where: {
            userId: user.userId,
            company: { archived: 0 },
          },
          select: { companyId: true },
        })
        scopedCompanyIds = assignments.map((a) => a.companyId)
      }
    } else if (user.role === 'SUPER_ADMIN') {
      if (requestedCompanyId) {
        scopedCompanyIds = [requestedCompanyId]
      } else {
        const companies = await prisma.company.findMany({
          where: { archived: 0 },
          select: { id: true },
        })
        scopedCompanyIds = companies.map((company) => company.id)
      }
    } else if (user.role === 'ADMIN' || user.role === 'HR') {
      const assignments = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          company: { archived: 0 },
        },
        select: { companyId: true },
      })

      const assignedIds = assignments.map((assignment) => assignment.companyId)
      if (requestedCompanyId) {
        if (!assignedIds.includes(requestedCompanyId)) {
          return withCors(ApiResponse.error('You do not have access to that company', 403), origin)
        }
        scopedCompanyIds = [requestedCompanyId]
      } else {
        scopedCompanyIds = assignedIds
      }
    } else {
      const staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true },
        select: { id: true, companyId: true },
      })

      if (!staffRecord) {
        return withCors(ApiResponse.error('Staff record not found', 404), origin)
      }

      if (requestedCompanyId && staffRecord.companyId !== requestedCompanyId) {
        return withCors(ApiResponse.error('You do not have access to that company', 403), origin)
      }

      scopedCompanyIds = [staffRecord.companyId]
    }

    // Fetch company currency
    const companyCurrencies = await prisma.company.findMany({
      where: { id: { in: scopedCompanyIds } },
      select: { id: true, baseCurrency: true },
    })
    const defaultCurrency = companyCurrencies[0]?.baseCurrency || 'NGN'

    if (scopedCompanyIds.length === 0) {
      return withCors(
        ApiResponse.success(
          {
            companyContext: {
              role: user.role,
              scopedCompanyIds: [],
              baseCurrency: 'NGN',
            },
            kpis: {
              totalLoansIssued: 0,
              totalOutstanding: 0,
              activeLoans: 0,
              overdueLoans: 0,
              defaultedLoans: 0,
              pendingRequests: 0,
              recoveryRatePercent: 0,
            },
            loans: [],
            myLoans: [],
            loanTerms: [],
            benefitsCatalog: [],
            loanRequests: [],
            benefitRequests: [],
            benefitAllocations: [],
            alerts: [],
            insights: [],
            departmentDistribution: [],
          },
          'Staff loans and benefits dashboard data fetched successfully'
        ),
        origin
      )
    }

    // Fetch data in parallel
    const [loanEntries, activeStaffCount, loanRequestsData, benefitRequestsData, benefitAllocationsData, loanPolicies, benefitPolicies] = await Promise.all([
      prisma.deductionEntry.findMany({
        where: {
          companyId: { in: scopedCompanyIds },
          deductionType: { in: ['LOAN', 'SALARY_ADVANCE'] },
        },
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.staffRecord.count({
        where: {
          companyId: { in: scopedCompanyIds },
          isActive: true,
        },
      }),
      prisma.loanRequest.findMany({
        where: {
          companyId: { in: scopedCompanyIds },
        },
        include: {
          staff: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              department: true,
            },
          },
          approver: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.benefitRequest.findMany({
        where: {
          companyId: { in: scopedCompanyIds },
        },
        include: {
          staff: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              department: true,
            },
          },
          approver: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.benefitAllocation.findMany({
        where: {
          companyId: { in: scopedCompanyIds },
        },
        include: {
          staff: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.loanPolicy.findMany({
        where: { companyId: { in: scopedCompanyIds }, isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.benefitPolicy.findMany({
        where: { companyId: { in: scopedCompanyIds }, isActive: true },
        orderBy: { category: 'asc' },
      }),
    ])

    const aggregatedByLoan = new Map<string, AggregatedLoan>()

    loanEntries.forEach((entry) => {
      const staffName = `${entry.staff.firstName} ${entry.staff.lastName}`.trim()
      const deductionAmount = Number(entry.amount || 0)
      const loanKey = `${entry.staffId}:${entry.deductionType}`

      const existing = aggregatedByLoan.get(loanKey)
      if (!existing) {
        const impliedAmountIssued = deductionAmount * 12
        const ageInDays = Math.max(
          1,
          Math.round((Date.now() - new Date(entry.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        )
        const progressPercent = Math.min(100, Math.round((deductionAmount / Math.max(impliedAmountIssued, 1)) * 100))
        const status = deriveLoanStatus(ageInDays, progressPercent)
        const outstanding = Math.max(0, impliedAmountIssued - deductionAmount)
        const outstandingRatio = impliedAmountIssued === 0 ? 0 : outstanding / impliedAmountIssued

        aggregatedByLoan.set(loanKey, {
          id: `LN-${entry.staffId.slice(-4)}-${entry.id.slice(-4)}`,
          staffId: entry.staffId,
          employeeName: staffName,
          employeeEmail: entry.staff.email,
          loanType: entry.deductionType === 'LOAN' ? 'Loan Repayment' : 'Salary Advance',
          amountIssued: impliedAmountIssued,
          amountRepaid: deductionAmount,
          outstandingBalance: outstanding,
          monthlyDeduction: deductionAmount,
          nextPaymentDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
          status,
          riskLevel: deriveRiskLevel(status, outstandingRatio),
          progressPercent,
        })
        return
      }

      existing.amountRepaid += deductionAmount
      existing.monthlyDeduction = Math.max(existing.monthlyDeduction, deductionAmount)
      existing.outstandingBalance = Math.max(0, existing.amountIssued - existing.amountRepaid)
      existing.progressPercent = Math.min(100, Math.round((existing.amountRepaid / Math.max(existing.amountIssued, 1)) * 100))
      existing.status = deriveLoanStatus(120, existing.progressPercent)
      existing.riskLevel = deriveRiskLevel(
        existing.status,
        existing.amountIssued === 0 ? 0 : existing.outstandingBalance / existing.amountIssued
      )
    })

    const loans = Array.from(aggregatedByLoan.values())

    // KPIs computed from LoanRequest table (accurate principal, rate, tenure, status)
    const approvedLoanRequests = loanRequestsData.filter((lr) =>
      ['APPROVED', 'DISBURSED'].includes(lr.status as string)
    )

    const activeLoans = approvedLoanRequests.length
    const defaultedLoans = loanRequestsData.filter((lr) => lr.status === 'DEFAULTED').length
    const overdueLoans = defaultedLoans // LoanRequest has no OVERDUE status yet; use DEFAULTED

    const totalIssued = approvedLoanRequests.reduce((s, lr) => s + Number(lr.requestedAmount), 0)

    // Outstanding balance: amortize each loan from its approval date
    const totalOutstanding = approvedLoanRequests.reduce((s, lr) => {
      const P = Number(lr.requestedAmount)
      const rate = Number(lr.interestRate ?? 0) / 100 / 12
      const n = lr.tenureMonths ?? 12
      const monthly =
        Number(lr.monthlyRepayment ?? 0) ||
        (rate > 0 ? (P * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1) : P / n)
      const startDate = lr.approvedAt ?? lr.createdAt
      const monthsElapsed = Math.min(n, Math.max(0, Math.floor((Date.now() - new Date(startDate).getTime()) / (30.44 * 86400000))))
      let balance = P
      for (let i = 0; i < monthsElapsed; i++) {
        const interest = balance * rate
        balance = Math.max(0, balance - (monthly - interest))
      }
      return s + balance
    }, 0)

    const totalMonthlyRepayment = approvedLoanRequests.reduce(
      (s, lr) => s + Number(lr.monthlyRepayment ?? 0), 0
    )

    const totalRepaid = totalIssued - totalOutstanding
    const recoveryRatePercent = totalIssued > 0 ? Number(((totalRepaid / totalIssued) * 100).toFixed(1)) : 0

    // myLoans for STAFF personal scope: derive from LoanRequest (accurate, same as my-loans endpoint)
    const myLoans = (user.role === 'STAFF' || personalScope)
      ? loanRequestsData
          .filter((lr) => lr.staff.email === user.email)
          .map((lr) => {
            const P = Number(lr.requestedAmount)
            const rate = Number(lr.interestRate ?? 0) / 100 / 12
            const n = lr.tenureMonths ?? 12
            const monthly =
              Number(lr.monthlyRepayment ?? 0) ||
              (rate > 0 ? (P * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1) : P / n)
            const startDate = lr.approvedAt ?? lr.createdAt
            const monthsElapsed = Math.min(n, Math.max(0, Math.floor((Date.now() - new Date(startDate).getTime()) / (30.44 * 86400000))))
            let balance = P
            for (let i = 0; i < monthsElapsed; i++) {
              const interest = balance * rate
              balance = Math.max(0, balance - (monthly - interest))
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
              monthlyDeduction: monthly,
              progressPercent: pctPaid,
              status: displayStatus,
            }
          })
      : []

    // Fetch employee salary for STAFF users — sum of latest month's payrolls
    // (Some companies split payments e.g. salary + bonus as separate payroll entries)
    let employeeSalary = 0
    let employeeNetSalary = 0
    if (user.role === 'STAFF') {
      const staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true },
        select: { id: true },
      })
      if (staffRecord) {
        // Find the latest month/year that has payroll records for this staff
        const latestPayPeriod = await prisma.payroll.findFirst({
          where: {
            staffRecordId: staffRecord.id,
            status: 'PROCESSED',
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          select: { year: true, month: true },
        })

        if (latestPayPeriod) {
          // Get ALL payroll records from that same month (some companies split payments)
          const monthPayrolls = await prisma.payroll.findMany({
            where: {
              staffRecordId: staffRecord.id,
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

          if (monthPayrolls.length > 0) {
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
        }
      }
    }

    const isPersonalScope = personalScope || user.role === 'STAFF'

    // Helper — map a LoanRequest DB record to the API shape
    const mapLoanRequest = (lr: (typeof loanRequestsData)[number]) => ({
      id: lr.id,
      requestType: 'LOAN' as const,
      status: lr.status as any,
      employeeName: `${lr.staff.firstName} ${lr.staff.lastName}`.trim(),
      employeeEmail: lr.staff.email,
      title: `${lr.loanType} request`,
      amount: Number(lr.requestedAmount),
      tenureMonths: lr.tenureMonths,
      interestRate: Number(lr.interestRate ?? 0),
      monthlyRepayment: Number(lr.monthlyRepayment ?? 0),
      createdAt: lr.createdAt.toISOString(),
      reviewedAt: lr.approvedAt?.toISOString() || null,
      reviewerComment: lr.approvalComment || lr.rejectionReason || null,
      approverName: lr.approver ? `${lr.approver.firstName} ${lr.approver.lastName}`.trim() : null,
      guarantorStatus: (lr as any).guarantorStatus || 'NOT_REQUIRED',
      guarantorStaffId: (lr as any).guarantorStaffId || null,
      disbursedAt: (lr as any).disbursedAt?.toISOString() || null,
      disbursedBy: (lr as any).disbursedBy || null,
    })

    // Process loan requests from new LoanRequest model
    const loanRequests = isPersonalScope
      ? loanRequestsData.filter((lr) => lr.staff.email === user.email).map(mapLoanRequest)
      : loanRequestsData.map(mapLoanRequest)

    // Process benefit requests from new BenefitRequest model
    const benefitRequests = isPersonalScope
      ? benefitRequestsData
          .filter((br) => br.staff.email === user.email)
          .map((br) => ({
            id: br.id,
            requestType: 'BENEFIT' as const,
            status: br.status as any,
            employeeName: `${br.staff.firstName} ${br.staff.lastName}`.trim(),
            employeeEmail: br.staff.email,
            title: `${br.benefitName} request`,
            benefitName: br.benefitName,
            createdAt: br.createdAt.toISOString(),
            reviewedAt: br.approvedAt?.toISOString() || null,
            reviewerComment: br.approvalComment || br.rejectionReason || null,
            approverName: br.approver ? `${br.approver.firstName} ${br.approver.lastName}`.trim() : null,
          }))
      : benefitRequestsData.map((br) => ({
        id: br.id,
        requestType: 'BENEFIT' as const,
        status: br.status as any,
        employeeName: `${br.staff.firstName} ${br.staff.lastName}`.trim(),
        employeeEmail: br.staff.email,
        title: `${br.benefitName} request`,
        benefitName: br.benefitName,
        createdAt: br.createdAt.toISOString(),
        reviewedAt: br.approvedAt?.toISOString() || null,
        reviewerComment: br.approvalComment || br.rejectionReason || null,
        approverName: br.approver ? `${br.approver.firstName} ${br.approver.lastName}`.trim() : null,
      }))

    // Process benefit allocations from new BenefitAllocation model
    const benefitAllocations = isPersonalScope
      ? benefitAllocationsData
          .filter((ba) => ba.staff.email === user.email)
          .map((ba) => ({
            id: ba.id,
            requestType: 'ALLOCATION' as const,
            status: ba.status as any,
            employeeName: `${ba.staff.firstName} ${ba.staff.lastName}`.trim(),
            employeeEmail: ba.staff.email,
            title: `${ba.benefitName} allocation`,
            amount: Number(ba.allocationAmount),
            benefitName: ba.benefitName,
            createdAt: ba.createdAt.toISOString(),
          }))
      : benefitAllocationsData.map((ba) => ({
        id: ba.id,
        requestType: 'ALLOCATION' as const,
        status: ba.status as any,
        employeeName: `${ba.staff.firstName} ${ba.staff.lastName}`.trim(),
        employeeEmail: ba.staff.email,
        title: `${ba.benefitName} allocation`,
        amount: Number(ba.allocationAmount),
        benefitName: ba.benefitName,
        createdAt: ba.createdAt.toISOString(),
      }))

    const pendingRequests = [
      ...loanRequestsData.filter((lr) => lr.status === 'PENDING'),
      ...benefitRequestsData.filter((br) => br.status === 'PENDING'),
    ].length

    // ── Department-wise distribution (from staff_records, company-scoped) ──
    // Get all active staff grouped by department for the scoped companies
    const staffByDept = await prisma.staffRecord.groupBy({
      by: ['department'],
      where: {
        companyId: { in: scopedCompanyIds },
        isActive: true,
        department: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    })

    // Build a map of department → total deduction amount (from loanEntries, already fetched)
    const deptAmountMap = new Map<string, number>()
    for (const entry of loanEntries) {
      const dept = entry.staff.department?.trim()
      if (dept) {
        deptAmountMap.set(dept, (deptAmountMap.get(dept) || 0) + Number(entry.amount || 0))
      }
    }

    const departmentDistribution = staffByDept
      .filter((d) => d.department) // safety: exclude null (already filtered above, but TS guard)
      .map((d) => ({
        name: d.department!,
        value: d._count.id,
        totalAmount: deptAmountMap.get(d.department!) || 0,
      }))

    // Also include departments with deductions but no active staff (edge case)
    for (const [dept, amount] of deptAmountMap) {
      if (!departmentDistribution.find((d) => d.name === dept)) {
        departmentDistribution.push({ name: dept, value: 0, totalAmount: amount })
      }
    }
    // Re-sort by staff count descending
    departmentDistribution.sort((a, b) => b.value - a.value)

    const alerts = [
      {
        id: 'al-001',
        type: 'warning',
        message: `${overdueLoans} loans are overdue and need attention.`,
      },
      {
        id: 'al-002',
        type: 'critical',
        message: `${defaultedLoans} loans are currently in default state.`,
      },
    ]

    const insights = [
      {
        id: 'ins-001',
        title: 'Recovery performance trend',
        detail: `Current recovery rate is ${recoveryRatePercent}%.`,
      },
      {
        id: 'ins-002',
        title: 'Coverage opportunity',
        detail: `${Math.max(0, activeStaffCount - loans.length)} active staff have no loan deductions captured.`,
      },
    ]

    return withCors(
      ApiResponse.success(
        {
          companyContext: {
            role: user.role,
            scopedCompanyIds,
            baseCurrency: defaultCurrency,
          },
          kpis: {
            totalLoansIssued: totalIssued,
            totalOutstanding,
            totalMonthlyRepayment,
            activeLoans,
            overdueLoans,
            defaultedLoans,
            pendingRequests,
            recoveryRatePercent,
          },
          loans,
          myLoans,
          employeeSalary,
          employeeNetSalary,
          loanTerms: loanPolicies,
          benefitsCatalog: benefitPolicies,
          loanRequests,
          benefitRequests,
          benefitAllocations,
          alerts,
          insights,
          departmentDistribution,
          labels: {
            totalLoansIssued: toNaira(totalIssued),
            totalOutstanding: toNaira(totalOutstanding),
          },
        },
        'Staff loans and benefits dashboard data fetched successfully'
      ),
      origin
    )
  } catch (error) {
    console.error('[Dashboard GET]', error)
    return withCors(handleApiError(error), origin)
  }
}
