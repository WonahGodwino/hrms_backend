// src/app/api/staff-loans-benefits/loan-requests/[id]/installments/route.ts
// GET — the persisted repayment schedule for one loan (RepaymentSchedule.jsx).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const loan = await prisma.loanRequest.findUnique({ where: { id: params.id }, select: { id: true, staffId: true, companyId: true } })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)

    if (loan.staffId !== user.userId) {
      // Non-owner access is governed purely by LOAN_MANAGEMENT page access
      // (SUPER_ADMIN always passes via canAccessPage) — role no longer gates it.
      if (!(await canAccessPage('LOAN_MANAGEMENT', user))) {
        return withCors(ApiResponse.error('You do not have access to this loan request', 403), origin)
      }
      // checkStaffAccess alone only recognizes HR/ADMIN/SUPER_ADMIN via their
      // UserCompany grants — STAFF never gets one (see auth/register/route.ts),
      // so a same-company fast path is needed for a page-access-granted STAFF
      // actor to reach their own company's records.
      const hasAccess = user.companyId === loan.companyId || (await checkStaffAccess(user, loan.companyId))
      if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this loan request', 403), origin)
    }

    const installments = await prisma.loanInstallment.findMany({
      where: { loanRequestId: loan.id },
      orderBy: { installmentNumber: 'asc' },
    })
    return withCors(ApiResponse.success({ installments }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
