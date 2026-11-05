// src/app/api/staff-loans-benefits/loan-requests/[id]/force-recovery/route.ts
// POST — HR/Finance manually records a repayment against a specific
// installment (recovery outside the automatic Payroll Generation deduction
// path — e.g. a manual bank transfer, or recovering from a guarantor).
// `recoveryNote` is required for the audit trail.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const RECOVERY_METHODS = ['SALARY_DEDUCTION', 'GUARANTOR_COVERAGE', 'MANUAL_PAYMENT', 'TERMINAL_BENEFITS']

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

    const body = await request.json()
    const { installmentId, amount, recoveryMethod, recoveryNote } = body || {}
    if (!installmentId) return withCors(ApiResponse.error('installmentId is required', 400), origin)
    if (!amount || amount <= 0) return withCors(ApiResponse.error('A positive amount is required', 400), origin)
    if (!RECOVERY_METHODS.includes(recoveryMethod)) return withCors(ApiResponse.error('Invalid recoveryMethod', 400), origin)
    if (!recoveryNote || typeof recoveryNote !== 'string') return withCors(ApiResponse.error('recoveryNote is required for the audit trail', 400), origin)

    const installment = await prisma.loanInstallment.findUnique({ where: { id: installmentId }, include: { loanRequest: true } })
    if (!installment) return withCors(ApiResponse.error('Installment not found', 404), origin)
    if (installment.loanRequestId !== params.id) return withCors(ApiResponse.error('Installment does not belong to this loan', 400), origin)

    // checkStaffAccess alone only recognizes HR/ADMIN/SUPER_ADMIN via their
    // UserCompany grants — STAFF never gets one (see auth/register/route.ts),
    // so a same-company fast path is needed for a page-access-granted STAFF
    // actor to reach their own company's records.
    const hasAccess = user.companyId === installment.companyId || (await checkStaffAccess(user, installment.companyId))
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this loan', 403), origin)
    if (installment.status === 'PAID') return withCors(ApiResponse.error('This installment is already fully paid', 400), origin)

    const newAmountPaid = Number(installment.amountPaid) + Number(amount)
    const totalDue = Number(installment.totalDue)
    const newStatus = newAmountPaid >= totalDue ? 'PAID' : 'PARTIALLY_PAID'

    // Overpayment guard: a payment can never push the loan's remaining
    // balance below zero — the recorded amount is clamped to what the loan
    // still owes. When the balance hits 0 the loan flips to REPAID in the
    // same transaction, ending all further deductions.
    const loan = await prisma.loanRequest.findUnique({
      where: { id: installment.loanRequestId },
      select: { remainingBalance: true },
    })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)
    const remainingBalance = Number(loan.remainingBalance ?? 0)
    if (remainingBalance <= 0) {
      return withCors(ApiResponse.error('This loan is already fully repaid', 400), origin)
    }
    const collect = Math.min(Number(amount), remainingBalance)
    const newBalance = Math.round((remainingBalance - collect) * 100) / 100

    const [updatedInstallment] = await prisma.$transaction([
      prisma.loanInstallment.update({
        where: { id: installmentId },
        data: {
          amountPaid: newAmountPaid,
          status: newStatus,
          paidAt: newStatus === 'PAID' ? new Date() : installment.paidAt,
          recoveryMethod,
          recoveryNote,
          recordedBy: user.userId,
        },
      }),
      prisma.loanRequest.update({
        where: { id: installment.loanRequestId },
        data: {
          remainingBalance: Math.max(0, newBalance),
          ...(newBalance <= 0 ? { status: 'REPAID' } : {}),
        },
      }),
    ])

    await logStaffActivity({
      staffRecordId: installment.loanRequest.staffId,
      companyId: installment.companyId,
      action: 'LOAN_INSTALLMENT_RECORDED',
      performedById: user.userId,
      performedByName: user.email,
      performedByRole: user.role,
      details: { loanRequestId: installment.loanRequestId, installmentId, amount, recoveryMethod, recoveryNote },
    })

    return withCors(ApiResponse.success(updatedInstallment, 'Repayment recorded'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
