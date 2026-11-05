// src/app/api/staff-loans-benefits/benefit-requests/[id]/approve/route.ts
// POST — act APPROVED on the current step. On the final step, also creates
// the resulting BenefitAllocation so the person's "My Benefits" view picks
// it up immediately.
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

    const benefitRequest = await prisma.benefitRequest.findUnique({ where: { id: params.id }, include: { policy: true } })
    if (!benefitRequest) return withCors(ApiResponse.error('Benefit request not found', 404), origin)
    if (benefitRequest.status !== 'PENDING_APPROVAL' || benefitRequest.currentStepOrder == null) {
      return withCors(ApiResponse.error('This benefit request is not awaiting approval', 400), origin)
    }

    const allowed = await canActOnStep(user, benefitRequest)
    if (!allowed) return withCors(ApiResponse.error('You are not the approver for this step', 403), origin)

    const actor = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : user.email

    const decision = await computeNextApprovalState({
      action: 'APPROVED',
      workflow: benefitRequest.approvalWorkflow as any,
      currentStepOrder: benefitRequest.currentStepOrder,
      companyId: benefitRequest.companyId,
      requestingStaffId: benefitRequest.staffId,
      requestType: 'BENEFIT_REQUEST',
      requestId: benefitRequest.id,
    })

    const updateData: any = decision.terminal
      ? { status: 'APPROVED', approvedAt: new Date(), currentStepOrder: null, currentApproverRole: null, currentApproverStaffId: null }
      : { currentStepOrder: decision.nextStepOrder, currentApproverRole: decision.currentApproverRole, currentApproverStaffId: decision.currentApproverStaffId }

    const ops: any[] = [
      prisma.benefitRequest.update({ where: { id: benefitRequest.id }, data: updateData }),
      prisma.approvalActionLog.create({
        data: {
          companyId: benefitRequest.companyId,
          requestType: 'BENEFIT_REQUEST',
          requestId: benefitRequest.id,
          stepOrder: benefitRequest.currentStepOrder,
          stepRole: benefitRequest.currentApproverRole || 'UNKNOWN',
          action: 'APPROVED',
          actorStaffId: user.userId,
          actorName,
          actorRole: user.role,
          comment: body?.comment || undefined,
        },
      }),
    ]

    if (decision.terminal) {
      ops.push(
        prisma.benefitAllocation.create({
          data: {
            companyId: benefitRequest.companyId,
            staffId: benefitRequest.staffId,
            benefitPolicyId: benefitRequest.benefitPolicyId,
            benefitPolicyVersion: benefitRequest.benefitPolicyVersion,
            benefitName: benefitRequest.benefitName,
            sourceRequestId: benefitRequest.id,
            allocationAmount: benefitRequest.requestedAmount ?? benefitRequest.policy.monetaryValue ?? 0,
            currencyCode: benefitRequest.currencyCode,
            allocatedBy: user.userId,
            note: 'Auto-allocated on benefit request approval',
          },
        })
      )
    }

    const [updated] = await prisma.$transaction(ops)

    await logStaffActivity({
      staffRecordId: benefitRequest.staffId,
      companyId: benefitRequest.companyId,
      action: 'BENEFIT_REQUEST_DECIDED',
      performedById: user.userId,
      performedByName: actorName,
      performedByRole: user.role,
      details: { benefitRequestId: benefitRequest.id, terminal: decision.terminal, outcome: decision.terminal ? 'APPROVED' : undefined },
    })

    if (decision.terminal) {
      await createNotification(
        benefitRequest.staffId,
        NOTIFICATION_TYPES.BENEFIT_REQUEST_APPROVED,
        'Your benefit request was approved',
        `Your request for ${benefitRequest.benefitName} has been approved and allocated.`,
        { benefitRequestId: benefitRequest.id },
        benefitRequest.companyId
      )
    } else {
      const approverIds = await resolveApproverStaffIds({
        currentApproverRole: decision.currentApproverRole,
        currentApproverStaffId: decision.currentApproverStaffId,
        companyId: benefitRequest.companyId,
      })
      await Promise.all(
        approverIds.map((id) =>
          createNotification(
            id,
            NOTIFICATION_TYPES.APPROVAL_ACTION_NEEDED,
            'A benefit request needs your approval',
            `A request for ${benefitRequest.benefitName} has advanced to your approval step.`,
            { benefitRequestId: benefitRequest.id },
            benefitRequest.companyId
          )
        )
      )
    }

    return withCors(ApiResponse.success(updated, 'Benefit request approved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
