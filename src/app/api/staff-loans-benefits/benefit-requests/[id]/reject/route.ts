// src/app/api/staff-loans-benefits/benefit-requests/[id]/reject/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
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
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    const body = await request.json().catch(() => ({}))

    if (!body?.reason || typeof body.reason !== 'string') {
      return withCors(ApiResponse.error('A rejection reason is required', 400), origin)
    }

    const benefitRequest = await prisma.benefitRequest.findUnique({ where: { id: params.id } })
    if (!benefitRequest) return withCors(ApiResponse.error('Benefit request not found', 404), origin)
    if (benefitRequest.status !== 'PENDING_APPROVAL' || benefitRequest.currentStepOrder == null) {
      return withCors(ApiResponse.error('This benefit request is not awaiting approval', 400), origin)
    }

    const allowed = await canActOnStep(user, benefitRequest)
    if (!allowed) return withCors(ApiResponse.error('You are not the approver for this step', 403), origin)

    const actor = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : user.email

    const [updated] = await prisma.$transaction([
      prisma.benefitRequest.update({
        where: { id: benefitRequest.id },
        data: { status: 'REJECTED', rejectionReason: body.reason, currentStepOrder: null, currentApproverRole: null, currentApproverStaffId: null },
      }),
      prisma.approvalActionLog.create({
        data: {
          companyId: benefitRequest.companyId,
          requestType: 'BENEFIT_REQUEST',
          requestId: benefitRequest.id,
          stepOrder: benefitRequest.currentStepOrder,
          stepRole: benefitRequest.currentApproverRole || 'UNKNOWN',
          action: 'REJECTED',
          actorStaffId: user.userId,
          actorName,
          actorRole: user.role,
          comment: body.reason,
        },
      }),
    ])

    await logStaffActivity({
      staffRecordId: benefitRequest.staffId,
      companyId: benefitRequest.companyId,
      action: 'BENEFIT_REQUEST_DECIDED',
      performedById: user.userId,
      performedByName: actorName,
      performedByRole: user.role,
      details: { benefitRequestId: benefitRequest.id, outcome: 'REJECTED', reason: body.reason },
    })

    await createNotification(
      benefitRequest.staffId,
      NOTIFICATION_TYPES.BENEFIT_REQUEST_REJECTED,
      'Your benefit request was rejected',
      `Your request for ${benefitRequest.benefitName} was rejected: ${body.reason}`,
      { benefitRequestId: benefitRequest.id },
      benefitRequest.companyId
    )

    return withCors(ApiResponse.success(updated, 'Benefit request rejected'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
