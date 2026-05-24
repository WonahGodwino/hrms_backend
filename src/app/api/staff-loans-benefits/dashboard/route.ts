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

const BENEFITS_CATALOG = [
  {
    id: 'ben-health-001',
    name: 'Comprehensive Health Coverage',
    category: 'Health',
    description: 'Primary staff and spouse cover with preventive care package.',
    keyValue: 'Up to N500,000 annual cover',
    eligibilityRule: 'Available after 3 months of employment',
    status: 'ELIGIBLE',
  },
  {
    id: 'ben-transport-001',
    name: 'Transportation Support',
    category: 'Financial',
    description: 'Monthly transportation support for approved staff levels.',
    keyValue: 'N35,000 monthly support',
    eligibilityRule: 'Available to field and shift teams',
    status: 'ELIGIBLE',
  },
  {
    id: 'ben-edu-001',
    name: 'Professional Certification Reimbursement',
    category: 'Learning',
    description: 'Reimbursement for approved certifications aligned to role growth.',
    keyValue: 'Up to N200,000 per year',
    eligibilityRule: 'Available after 6 months of employment',
    status: 'REQUIRES_TENURE',
  },
  {
    id: 'ben-wellness-001',
    name: 'Wellness and Fitness Allowance',
    category: 'Wellness',
    description: 'Quarterly wellness stipend for gym or fitness activities.',
    keyValue: 'N25,000 quarterly',
    eligibilityRule: 'Available to all confirmed staff',
    status: 'ELIGIBLE',
  },
]

const LOAN_TERMS = [
  {
    id: 'loan-term-001',
    name: 'Personal Loan',
    interestRatePercent: 5,
    maxDurationMonths: 18,
    maxAmount: 2500000,
    rules: [
      'Applicant must be a confirmed staff member',
      'Maximum debt service ratio is 40% of net salary',
      'Guarantor is mandatory above N1,000,000',
    ],
  },
  {
    id: 'loan-term-002',
    name: 'Emergency Loan',
    interestRatePercent: 2,
    maxDurationMonths: 6,
    maxAmount: 750000,
    rules: [
      'Fast-track approval for urgent needs',
      'Single outstanding emergency loan allowed',
      'Full disclosure note required on application',
    ],
  },
  {
    id: 'loan-term-003',
    name: 'Asset Loan',
    interestRatePercent: 8,
    maxDurationMonths: 24,
    maxAmount: 5000000,
    rules: [
      'Asset invoice or quote is mandatory',
      'Extended tenor requires dual guarantors',
      'Early repayment has no penalty',
    ],
  },
]

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

    let scopedCompanyIds: string[] = []

    if (user.role === 'SUPER_ADMIN') {
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

    if (scopedCompanyIds.length === 0) {
      return withCors(
        ApiResponse.success(
          {
            companyContext: {
              role: user.role,
              scopedCompanyIds: [],
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
            loanTerms: LOAN_TERMS,
            benefitsCatalog: BENEFITS_CATALOG,
            loanRequests: [],
            benefitRequests: [],
            benefitAllocations: [],
            alerts: [],
            insights: [],
          },
          'Staff loans and benefits dashboard data fetched successfully'
        ),
        origin
      )
    }

    // Fetch data in parallel
    const [loanEntries, activeStaffCount, loanRequestsData, benefitRequestsData, benefitAllocationsData] = await Promise.all([
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
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
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
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

    const totalIssued = loans.reduce((sum, loan) => sum + loan.amountIssued, 0)
    const totalOutstanding = loans.reduce((sum, loan) => sum + loan.outstandingBalance, 0)
    const totalRepaid = loans.reduce((sum, loan) => sum + loan.amountRepaid, 0)

    const activeLoans = loans.filter((loan) => loan.status === 'ACTIVE').length
    const overdueLoans = loans.filter((loan) => loan.status === 'OVERDUE').length
    const defaultedLoans = loans.filter((loan) => loan.status === 'DEFAULTED').length
    const recoveryRatePercent = totalIssued > 0 ? Number(((totalRepaid / totalIssued) * 100).toFixed(1)) : 0

    const myLoans = user.role === 'STAFF'
      ? loans.filter((loan) => loan.employeeEmail === user.email)
      : []

    // Process loan requests from new LoanRequest model
    const loanRequests = user.role === 'STAFF'
      ? loanRequestsData
          .filter((lr) => lr.staff.email === user.email)
          .map((lr) => ({
            id: lr.id,
            requestType: 'LOAN' as const,
            status: lr.status as any,
            employeeName: `${lr.staff.firstName} ${lr.staff.lastName}`.trim(),
            employeeEmail: lr.staff.email,
            title: `${lr.loanType} request`,
            amount: Number(lr.requestedAmount),
            tenureMonths: lr.tenureMonths,
            createdAt: lr.createdAt.toISOString(),
            reviewedAt: lr.approvedAt?.toISOString() || null,
            reviewerComment: lr.approvalComment || lr.rejectionReason || null,
          }))
      : loanRequestsData.map((lr) => ({
        id: lr.id,
        requestType: 'LOAN' as const,
        status: lr.status as any,
        employeeName: `${lr.staff.firstName} ${lr.staff.lastName}`.trim(),
        employeeEmail: lr.staff.email,
        title: `${lr.loanType} request`,
        amount: Number(lr.requestedAmount),
        tenureMonths: lr.tenureMonths,
        createdAt: lr.createdAt.toISOString(),
        reviewedAt: lr.approvedAt?.toISOString() || null,
        reviewerComment: lr.approvalComment || lr.rejectionReason || null,
      }))

    // Process benefit requests from new BenefitRequest model
    const benefitRequests = user.role === 'STAFF'
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
      }))

    // Process benefit allocations from new BenefitAllocation model
    const benefitAllocations = user.role === 'STAFF'
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
          },
          kpis: {
            totalLoansIssued: totalIssued,
            totalOutstanding,
            activeLoans,
            overdueLoans,
            defaultedLoans,
            pendingRequests,
            recoveryRatePercent,
          },
          loans,
          myLoans,
          loanTerms: LOAN_TERMS,
          benefitsCatalog: BENEFITS_CATALOG,
          loanRequests,
          benefitRequests,
          benefitAllocations,
          alerts,
          insights,
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
