// src/app/api/staff-loans-benefits/loan-requests/[id]/approve/route.ts
// POST — act APPROVED on the current approval step. Advances to the next
// step, or reaches terminal APPROVED status if this was the last one.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { canActOnStep, computeNextApprovalState, resolveApproverStaffIds } from '@/app/lib/staff-loans-benefits/approval-engine'
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

    const loan = await prisma.loanRequest.findUnique({ where: { id: params.id } })
    if (!loan) return withCors(ApiResponse.error('Loan request not found', 404), origin)
    if (loan.status !== 'PENDING_APPROVAL' || loan.currentStepOrder == null) {
      return withCors(ApiResponse.error('This loan request is not awaiting approval', 400), origin)
    }

    const allowed = await canActOnStep(user, loan)
    if (!allowed) return withCors(ApiResponse.error('You are not the approver for this step', 403), origin)

    const actor = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : user.email

    const decision = await computeNextApprovalState({
      action: 'APPROVED',
      workflow: loan.approvalWorkflow as any,
      currentStepOrder: loan.currentStepOrder,
      companyId: loan.companyId,
      requestingStaffId: loan.staffId,
      requestType: 'LOAN_REQUEST',
      requestId: loan.id,
    })

    const updateData: any = decision.terminal
      ? { status: 'APPROVED', approvedAt: new Date(), approvedAmount: loan.requestedAmount, currentStepOrder: null, currentApproverRole: null, currentApproverStaffId: null }
      : { currentStepOrder: decision.nextStepOrder, currentApproverRole: decision.currentApproverRole, currentApproverStaffId: decision.currentApproverStaffId }

    const [updated] = await prisma.$transaction([
      prisma.loanRequest.update({ where: { id: loan.id }, data: updateData }),
      prisma.approvalActionLog.create({
        data: {
          companyId: loan.companyId,
          requestType: 'LOAN_REQUEST',
          requestId: loan.id,
          stepOrder: loan.currentStepOrder,
          stepRole: loan.currentApproverRole || 'UNKNOWN',
          action: 'APPROVED',
          actorStaffId: user.userId,
          actorName,
          actorRole: user.role,
          comment: body?.comment || undefined,
        },
      }),
    ])

    await logStaffActivity({
      staffRecordId: loan.staffId,
      companyId: loan.companyId,
      action: 'LOAN_APPROVAL_STEP_ACTED',
      performedById: user.userId,
      performedByName: actorName,
      performedByRole: user.role,
      details: { loanRequestId: loan.id, step: loan.currentStepOrder, terminal: decision.terminal },
    })

    if (decision.terminal) {
      await createNotification(
        loan.staffId,
        NOTIFICATION_TYPES.LOAN_APPROVED,
        'Your loan request was approved',
        `Your ${loan.loanType} application has been fully approved.`,
        { loanRequestId: loan.id },
        loan.companyId
      )
    } else {
      const approverIds = await resolveApproverStaffIds({
        currentApproverRole: decision.currentApproverRole,
        currentApproverStaffId: decision.currentApproverStaffId,
        companyId: loan.companyId,
      })
      await Promise.all(
        approverIds.map((id) =>
          createNotification(
            id,
            NOTIFICATION_TYPES.APPROVAL_ACTION_NEEDED,
            'A loan request needs your approval',
            `A ${loan.loanType} application has advanced to your approval step.`,
            { loanRequestId: loan.id },
            loan.companyId
          )
        )
      )
      await createNotification(
        loan.staffId,
        NOTIFICATION_TYPES.APPROVAL_STEP_ADVANCED,
        'Your loan request moved to the next approval step',
        `Your ${loan.loanType} application has advanced to step ${decision.nextStepOrder}.`,
        { loanRequestId: loan.id },
        loan.companyId
      )
    }

    return withCors(ApiResponse.success(updated, 'Loan request approved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
