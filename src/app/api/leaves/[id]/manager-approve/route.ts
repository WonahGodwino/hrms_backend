// src/app/api/leaves/[id]/manager-approve/route.ts
// Line-manager decision on the current ladder step (see lib/leave/approval-chain.ts).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import {
  ChainError,
  decideStep,
  getActorStaff,
  hasHrCompanyAccess,
  isHrRole,
  notifyNextApprover,
  notifyOutcome,
} from '@/app/lib/leave/approval-chain'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    let user: any = null
    try {
      user = await requireModuleAccess(token, 'LEAVE', ['MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'])
    } catch (e) {
      // Staff who are line managers carry the STAFF role; fall back to plain auth
      // and let the chain decide whether they may act.
      user = requireAuth(token)
    }

    const { id } = await params
    const body = await request.json()

    if (!body.action || !['APPROVE', 'REJECT'].includes(body.action)) {
      return withCors(ApiResponse.error('Action must be either "APPROVE" or "REJECT"', 400), origin)
    }
    if (body.action === 'REJECT' && !body.comments) {
      return withCors(ApiResponse.error('Comments are required when rejecting leave', 400), origin)
    }

    const leave = await prisma.leaveRequest.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    })
    if (!leave) {
      return withCors(ApiResponse.error('Leave request not found', 404), origin)
    }

    const actor = await getActorStaff(user, leave.companyId)
    if (!actor) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }
    // Token role carries any active role elevation; fall back to the stored role.
    const effectiveRole = isHrRole(user.role) ? user.role : actor.role
    if (isHrRole(effectiveRole) && !(await hasHrCompanyAccess({ ...actor, role: effectiveRole }, user.userId, leave.companyId))) {
      return withCors(ApiResponse.error('You do not have access to approve this leave', 403), origin)
    }

    const { updated, finished } = await decideStep({
      leaveRequestId: id,
      expectedKind: 'LINE_MANAGER',
      action: body.action,
      actor: { id: actor.id, role: effectiveRole },
      user,
      comments: body.comments,
    })

    if (finished) {
      await notifyOutcome(updated)
    } else {
      await notifyNextApprover(id)
    }

    const message =
      body.action === 'REJECT'
        ? 'Leave request rejected by manager.'
        : updated.currentStep === 'HR'
          ? 'Leave request approved by line manager(s). Awaiting HR approval.'
          : 'Approved. Awaiting the next line manager.'

    return withCors(ApiResponse.success({ leave: updated }, message), origin)
  } catch (error) {
    if (error instanceof ChainError) {
      return withCors(ApiResponse.error(error.message, error.status), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}
