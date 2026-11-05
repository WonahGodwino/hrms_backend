// src/app/api/staff-loans-benefits/loan-requests/[id]/cancel/route.ts
// POST — withdraw an application. Self-service only, and only before it's
// left the pre-disbursement stages.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logStaffActivity } from '@/app/lib/device/device-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const CANCELLABLE_STATUSES = ['PENDING_GUARANTOR', 'PENDING_APPROVAL']

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const loan = await prisma.loanRequest.findUnique({ where: { id: params.id } })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)
    if (loan.staffId !== user.userId) return withCors(ApiResponse.error('You can only cancel your own loan requests', 403), origin)
    if (!CANCELLABLE_STATUSES.includes(loan.status)) {
      return withCors(ApiResponse.error('This loan request can no longer be withdrawn', 400), origin)
    }

    const updated = await prisma.loanRequest.update({
      where: { id: params.id },
      data: { status: 'CANCELLED', currentStepOrder: null, currentApproverRole: null, currentApproverStaffId: null },
    })

    await logStaffActivity({
      staffRecordId: loan.staffId,
      companyId: loan.companyId,
      action: 'LOAN_REJECTED',
      performedById: user.userId,
      performedByName: user.email,
      performedByRole: user.role,
      details: { loanRequestId: loan.id, reason: 'Withdrawn by applicant' },
    })

    return withCors(ApiResponse.success(updated, 'Loan application withdrawn'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
