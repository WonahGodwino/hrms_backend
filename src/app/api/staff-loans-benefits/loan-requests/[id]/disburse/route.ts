// src/app/api/staff-loans-benefits/loan-requests/[id]/disburse/route.ts
// POST — APPROVED -> DISBURSED. Generates the persisted installment
// schedule (LoanInstallment rows) — this is what Payroll Generation later
// reads to auto-deduct repayments, and what the admin Force Recovery /
// staff Repayment Schedule views render.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'
import { buildInstallmentSchedule } from '@/app/lib/staff-loans-benefits/calculators'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    // STAFF included: LOAN_MANAGEMENT access is now decided purely by the
    // canAccessPage check below, not by platform role — see decision #1.
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)
    if (!(await canAccessPage('LOAN_MANAGEMENT', user))) {
      return withCors(ApiResponse.error('You do not have access to Loan Management', 403), origin)
    }

    const loan = await prisma.loanRequest.findUnique({ where: { id: params.id } })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)
    // checkStaffAccess alone only recognizes HR/ADMIN/SUPER_ADMIN via their
    // UserCompany grants — STAFF never gets one (see auth/register/route.ts),
    // so a same-company fast path is needed for a page-access-granted STAFF
    // actor to reach their own company's records.
    const hasAccess = user.companyId === loan.companyId || (await checkStaffAccess(user, loan.companyId))
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this loan request', 403), origin)
    if (loan.status !== 'APPROVED') return withCors(ApiResponse.error('Only an approved loan can be disbursed', 400), origin)

    const principal = Number(loan.approvedAmount ?? loan.requestedAmount)
    const disbursedAt = new Date()
    // The fee rides inside the plan (month 1) — remainingBalance starts at the
    // FULL repayable (principal + interest + fee) so the staff can never pay
    // less than the policy charges, and progress math stays consistent.
    const processingFee = Number(loan.processingFeeAmount ?? 0)
    const schedule = buildInstallmentSchedule({
      principal,
      monthlyRatePct: Number(loan.interestRatePercent),
      months: loan.tenureMonths,
      startDate: disbursedAt,
      processingFee,
    })
    const totalRepayable = schedule.reduce((s, i) => Math.round((s + i.totalDue) * 100) / 100, 0)
    const expectedRepaymentDate = schedule[schedule.length - 1]?.dueDate

    const [updated] = await prisma.$transaction([
      prisma.loanRequest.update({
        where: { id: loan.id },
        data: {
          status: 'DISBURSED',
          disbursedAt,
          disbursedBy: user.userId,
          expectedRepaymentDate,
          // Full repayable incl. interest + fee, kept consistent with the
          // schedule (its installments sum to exactly this).
          totalRepayable,
          monthlyRepayment: Math.round((schedule[0]?.totalDue ?? 0) * 100) / 100,
          remainingBalance: totalRepayable,
        },
      }),
      prisma.loanInstallment.createMany({
        data: schedule.map((s) => ({
          loanRequestId: loan.id,
          companyId: loan.companyId,
          installmentNumber: s.installmentNumber,
          dueDate: s.dueDate,
          principalDue: s.principalDue,
          interestDue: s.interestDue,
          totalDue: s.totalDue,
        })),
      }),
    ])

    await logStaffActivity({
      staffRecordId: loan.staffId,
      companyId: loan.companyId,
      action: 'LOAN_DISBURSED',
      performedById: user.userId,
      performedByName: user.email,
      performedByRole: user.role,
      details: { loanRequestId: loan.id, principal },
    })

    await createNotification(
      loan.staffId,
      NOTIFICATION_TYPES.LOAN_DISBURSED,
      'Your loan has been disbursed',
      `Your ${loan.loanType} of ${principal} has been disbursed. Repayment starts next month.`,
      { loanRequestId: loan.id },
      loan.companyId
    )

    return withCors(ApiResponse.success(updated, 'Loan disbursed'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
