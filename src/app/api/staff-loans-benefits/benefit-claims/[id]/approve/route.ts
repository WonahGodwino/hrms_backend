// src/app/api/staff-loans-benefits/benefit-claims/[id]/approve/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
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
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    const body = await request.json().catch(() => ({}))

    const claim = await prisma.benefitClaim.findUnique({ where: { id: params.id } })
    if (!claim) return withCors(ApiResponse.error('Claim not found', 404), origin)
    if (claim.status !== 'PENDING_APPROVAL' || claim.currentStepOrder == null) {
      return withCors(ApiResponse.error('This claim is not awaiting approval', 400), origin)
    }

    const allowed = await canActOnStep(user, claim)
    if (!allowed) return withCors(ApiResponse.error('You are not the approver for this step', 403), origin)

    const actor = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : user.email

    const decision = await computeNextApprovalState({
      action: 'APPROVED',
      workflow: claim.approvalWorkflow as any,
      currentStepOrder: claim.currentStepOrder,
      companyId: claim.companyId,
      requestingStaffId: claim.staffId,
      requestType: 'BENEFIT_CLAIM',
      requestId: claim.id,
    })

    const updateData: any = decision.terminal
      ? { status: 'APPROVED', currentStepOrder: null, currentApproverRole: null, currentApproverStaffId: null }
      : { currentStepOrder: decision.nextStepOrder, currentApproverRole: decision.currentApproverRole, currentApproverStaffId: decision.currentApproverStaffId }

    const [updated] = await prisma.$transaction([
      prisma.benefitClaim.update({ where: { id: claim.id }, data: updateData }),
      prisma.approvalActionLog.create({
        data: {
          companyId: claim.companyId,
          requestType: 'BENEFIT_CLAIM',
          requestId: claim.id,
          stepOrder: claim.currentStepOrder,
          stepRole: claim.currentApproverRole || 'UNKNOWN',
          action: 'APPROVED',
          actorStaffId: user.userId,
          actorName,
          actorRole: user.role,
          comment: body?.comment || undefined,
        },
      }),
    ])

    await logStaffActivity({
      staffRecordId: claim.staffId,
      companyId: claim.companyId,
      action: 'BENEFIT_CLAIM_DECIDED',
      performedById: user.userId,
      performedByName: actorName,
      performedByRole: user.role,
      details: { benefitClaimId: claim.id, terminal: decision.terminal },
    })

    if (decision.terminal) {
      await createNotification(
        claim.staffId,
        NOTIFICATION_TYPES.BENEFIT_CLAIM_APPROVED,
        'Your claim was approved',
        `Your claim of ${claim.amount} for ${claim.benefitName} has been approved and is awaiting payment.`,
        { benefitClaimId: claim.id },
        claim.companyId
      )
    } else {
      const approverIds = await resolveApproverStaffIds({
        currentApproverRole: decision.currentApproverRole,
        currentApproverStaffId: decision.currentApproverStaffId,
        companyId: claim.companyId,
      })
      await Promise.all(
        approverIds.map((id) =>
          createNotification(id, NOTIFICATION_TYPES.APPROVAL_ACTION_NEEDED, 'A claim needs your approval', `A claim for ${claim.benefitName} has advanced to your approval step.`, { benefitClaimId: claim.id }, claim.companyId)
        )
      )
    }

    return withCors(ApiResponse.success(updated, 'Claim approved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
