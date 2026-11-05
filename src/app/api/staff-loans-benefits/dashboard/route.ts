// src/app/api/staff-loans-benefits/dashboard/route.ts
// GET — financial cockpit. Self-scoped by default (own loans/benefits +
// net salary); HR/ADMIN/SUPER_ADMIN may pass ?staffId= to view someone
// else's, or omit it for an org-wide summary (AdminFinancialDashboard.jsx).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'
import { resolveStaffGrossSalary, resolveStaffNetSalary } from '@/app/lib/staff-loans-benefits/staff-finance'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const { searchParams } = new URL(request.url)
    // Viewing another staff member's dashboard by ?staffId= stays
    // role-based (ADMIN/HR/SUPER_ADMIN) — unrelated to the FINANCIAL_DASHBOARD
    // page-access gate below, which governs the org-wide summary only.
    const isPrivilegedRole = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user.role)
    const staffIdParam = searchParams.get('staffId')
    // Org-wide access is governed purely by FINANCIAL_DASHBOARD page access
    // (SUPER_ADMIN always passes via canAccessPage) — role no longer gates
    // it. Anyone without access degrades to their own personal view rather
    // than being 403'd, since this route doubles as the self-service dashboard.
    const orgWide = !staffIdParam && (await canAccessPage('FINANCIAL_DASHBOARD', user))

    if (orgWide) {
      if (!user.companyId) return withCors(ApiResponse.success({ orgWide: true, loans: [], benefits: [] }), origin)

      const [loans, benefitAllocations, benefitRequests] = await Promise.all([
        prisma.loanRequest.findMany({ where: { companyId: user.companyId }, select: { status: true, requestedAmount: true, approvedAmount: true, monthlyRepayment: true, remainingBalance: true } }),
        prisma.benefitAllocation.findMany({ where: { companyId: user.companyId }, select: { status: true, allocationAmount: true } }),
        prisma.benefitRequest.findMany({ where: { companyId: user.companyId }, select: { status: true } }),
      ])

      // A loan with a zero balance is fully repaid regardless of whether its
      // status row has flipped to REPAID yet — it must not count toward
      // outstanding/active/monthly-deduction figures.
      const isActive = (l: { status: string; remainingBalance: unknown }) => l.status === 'DISBURSED' && Number(l.remainingBalance ?? 0) > 0
      const totalIssued = loans.reduce((s, l) => s + (l.status === 'DISBURSED' || l.status === 'REPAID' ? Number(l.approvedAmount ?? l.requestedAmount) : 0), 0)
      const totalOutstanding = loans.reduce((s, l) => s + (isActive(l) ? Number(l.remainingBalance ?? 0) : 0), 0)
      const activeCount = loans.filter(isActive).length
      const pendingCount = loans.filter((l) => l.status === 'PENDING_GUARANTOR' || l.status === 'PENDING_APPROVAL').length

      return withCors(
        ApiResponse.success({
          orgWide: true,
          loanKpis: { totalIssued, totalOutstanding, activeCount, pendingCount, totalLoans: loans.length },
          benefitKpis: {
            totalAllocated: benefitAllocations.reduce((s, b) => s + Number(b.allocationAmount), 0),
            activeAllocations: benefitAllocations.filter((b) => b.status === 'ACTIVE').length,
            pendingRequests: benefitRequests.filter((r) => r.status === 'PENDING_APPROVAL').length,
          },
        }),
        origin
      )
    }

    const targetStaffId = staffIdParam && isPrivilegedRole ? staffIdParam : user.userId
    if (staffIdParam && isPrivilegedRole) {
      const target = await prisma.staffRecord.findUnique({ where: { id: staffIdParam }, select: { companyId: true } })
      if (!target || !(await checkStaffAccess(user, target.companyId))) {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
    }

    const [grossSalary, netSalary, loans, benefitAllocations, benefitRequests, benefitAllocationHistory] = await Promise.all([
      resolveStaffGrossSalary(targetStaffId),
      resolveStaffNetSalary(targetStaffId),
      prisma.loanRequest.findMany({ where: { staffId: targetStaffId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.benefitAllocation.findMany({ where: { staffId: targetStaffId, status: 'ACTIVE' } }),
      prisma.benefitRequest.findMany({ where: { staffId: targetStaffId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      // Allocation history (not just still-ACTIVE rows) feeds Recent Activity:
      // an allocation that was used up / expired should still appear as an
      // activity item, alongside its timestamp.
      prisma.benefitAllocation.findMany({ where: { staffId: targetStaffId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ])

    // Active = still disbursed AND still owes money. A zero-balance loan is
    // fully repaid — it must drop out of Monthly Deductions, Total
    // Outstanding, Active Loans, and the next-deduction banner.
    const activeLoans = loans.filter((l) => l.status === 'DISBURSED' && Number(l.remainingBalance ?? 0) > 0)
    const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.remainingBalance ?? 0), 0)
    const totalMonthlyDeduction = activeLoans.reduce((s, l) => s + Number(l.monthlyRepayment ?? 0), 0)

    // Per-loan display helpers, mirroring the loan-requests list endpoint:
    // earliest unpaid installment per loan ("next deduction") + repayment
    // progress (money repaid vs totalRepayable).
    const loanIds = loans.map((l) => l.id)
    const openInstallments = loanIds.length
      ? await prisma.loanInstallment.findMany({
          where: { loanRequestId: { in: loanIds }, status: { notIn: ['PAID', 'WAIVED'] } },
          orderBy: { dueDate: 'asc' },
          select: { loanRequestId: true, dueDate: true },
        })
      : []
    const nextDueByLoan = new Map<string, Date>()
    for (const inst of openInstallments) {
      if (!nextDueByLoan.has(inst.loanRequestId)) nextDueByLoan.set(inst.loanRequestId, inst.dueDate)
    }

    // Repayment activity for Recent Activity: actual PAID installments (the
    // moments money left, whether via payroll deduction, force recovery or a
    // manual payment), newest payment first, with their loan's display name.
    // recentLoans rows only carry application/disbursement moments — without
    // this, a staff member faithfully repaying every month shows zero activity.
    const paidInstallments = loanIds.length
      ? await prisma.loanInstallment.findMany({
          where: { loanRequestId: { in: loanIds }, status: 'PAID' },
          orderBy: { paidAt: 'desc' },
          take: 10,
          select: {
            id: true,
            loanRequestId: true,
            installmentNumber: true,
            totalDue: true,
            amountPaid: true,
            paidAt: true,
            recoveryMethod: true,
          },
        })
      : []
    const loanNameById = new Map(loans.map((l) => [l.id, l.loanType || l.purpose || 'Loan']))
    const repaymentActivities = paidInstallments.map((inst) => ({
      id: `installment-${inst.id}`,
      kind: 'LOAN_REPAYMENT' as const,
      title: `Loan repayment — installment ${inst.installmentNumber} (${loanNameById.get(inst.loanRequestId) || 'Loan'})`,
      createdAt: inst.paidAt,
      amount: Number(inst.amountPaid ?? inst.totalDue ?? 0),
      recoveryMethod: inst.recoveryMethod,
      loanRequestId: inst.loanRequestId,
      status: 'PAID' as const,
    }))

    const decoratedLoans = loans.map((l) => {
      const totalRepayable = Number(l.totalRepayable ?? 0)
      const remaining = Number(l.remainingBalance ?? 0)
      const progressPercent =
        (l.status === 'DISBURSED' || l.status === 'REPAID') && totalRepayable > 0
          ? Math.min(100, Math.max(0, Math.round(((totalRepayable - remaining) / totalRepayable) * 100)))
          : 0
      const nextDue = nextDueByLoan.get(l.id)
      return {
        ...l,
        outstandingBalance: remaining,
        monthlyDeduction: Number(l.monthlyRepayment ?? 0),
        progressPercent,
        ...(nextDue ? { nextInstallmentDue: nextDue } : {}),
      }
    })

    return withCors(
      ApiResponse.success({
        orgWide: false,
        grossSalary,
        netSalary,
        loanKpis: { totalOutstanding, totalMonthlyDeduction, activeCount: activeLoans.length },
        benefitKpis: { activeCount: benefitAllocations.length, totalValue: benefitAllocations.reduce((s, b) => s + Number(b.allocationAmount), 0) },
        // Aliases so the frontend can read one canonical shape: the personal
        // dashboard cards read myLoans/benefitAllocations/loanRequests.
        myLoans: decoratedLoans,
        loanRequests: decoratedLoans,
        benefitAllocations,
        recentLoans: decoratedLoans,
        recentBenefitRequests: benefitRequests,
        // Full allocation history (ACTIVE + used up/expired/cancelled) for
        // Recent Activity — the old payload only exposed still-ACTIVE rows.
        recentBenefitAllocations: benefitAllocationHistory,
        // Actual repayment events, newest first.
        recentRepayments: repaymentActivities,
        activeBenefits: benefitAllocations,
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
