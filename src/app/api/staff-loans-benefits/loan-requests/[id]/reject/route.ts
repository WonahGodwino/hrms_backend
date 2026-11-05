// src/app/api/staff-loans-benefits/loan-requests/[id]/reject/route.ts
// POST — act REJECTED on the current approval step. Always terminal — no
// "return to step 1" loop; a rejected request must be resubmitted fresh.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { canActOnStep } from '@/app/lib/staff-loans-benefits/approval-engine'
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
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)
    const body = await request.json().catch(() => ({}))

    if (!body?.reason || typeof body.reason !== 'string') {
      return withCors(ApiResponse.error('A rejection reason is required', 400), origin)
    }

    const loan = await prisma.loanRequest.findUnique({ where: { id: params.id } })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)
    if (loan.status !== 'PENDING_APPROVAL' || loan.currentStepOrder == null) {
      return withCors(ApiResponse.error('This loan request is not awaiting approval', 400), origin)
    }

    const allowed = await canActOnStep(user, loan)
    if (!allowed) return withCors(ApiResponse.error('You are not the approver for this step', 403), origin)

    const actor = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : user.email

    const [updated] = await prisma.$transaction([
      prisma.loanRequest.update({
        where: { id: loan.id },
        data: {
          status: 'REJECTED',
          rejectionReason: body.reason,
          rejectedAtStep: loan.currentStepOrder,
          rejectedByRole: loan.currentApproverRole,
          currentStepOrder: null,
          currentApproverRole: null,
          currentApproverStaffId: null,
        },
      }),
      prisma.approvalActionLog.create({
        data: {
          companyId: loan.companyId,
          requestType: 'LOAN_REQUEST',
          requestId: loan.id,
          stepOrder: loan.currentStepOrder,
          stepRole: loan.currentApproverRole || 'UNKNOWN',
          action: 'REJECTED',
          actorStaffId: user.userId,
          actorName,
          actorRole: user.role,
          comment: body.reason,
        },
      }),
    ])

    await logStaffActivity({
      staffRecordId: loan.staffId,
      companyId: loan.companyId,
      action: 'LOAN_REJECTED',
      performedById: user.userId,
      performedByName: actorName,
      performedByRole: user.role,
      details: { loanRequestId: loan.id, reason: body.reason },
    })

    await createNotification(
      loan.staffId,
      NOTIFICATION_TYPES.LOAN_REJECTED,
      'Your loan request was rejected',
      `Your ${loan.loanType} application was rejected: ${body.reason}`,
      { loanRequestId: loan.id },
      loan.companyId
    )

    return withCors(ApiResponse.success(updated, 'Loan request rejected'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
