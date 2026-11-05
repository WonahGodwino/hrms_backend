// src/app/api/leaves/[id]/hr-approve/route.ts
// Final HR decision once the department line-manager ladder (if any) has approved.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import {
  ChainError,
  decideStep,
  getActorStaff,
  hasHrCompanyAccess,
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
    // Only HR, ADMIN, SUPER_ADMIN can approve at HR level
    const user = await requireModuleAccess(token, 'LEAVE', ['HR', 'ADMIN', 'SUPER_ADMIN'])

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

    const actor =
      (await getActorStaff(user, leave.companyId)) ||
      // HR/Admin working across companies may have no staff record in this one.
      null
    const actingAs = actor ?? { id: user.userId, role: user.role, companyId: null }
    if (!(await hasHrCompanyAccess(actingAs, user.userId, leave.companyId))) {
      return withCors(ApiResponse.error('You do not have access to approve this leave', 403), origin)
    }

    const { updated } = await decideStep({
      leaveRequestId: id,
      expectedKind: 'HR',
      action: body.action,
      actor: { id: actingAs.id, role: user.role },
      user,
      comments: body.comments,
    })

    await notifyOutcome(updated)

    return withCors(
      ApiResponse.success(
        updated,
        body.action === 'APPROVE'
          ? 'Leave request approved by HR/Admin successfully'
          : 'Leave request rejected by HR/Admin'
      ),
      origin
    )
  } catch (error) {
    if (error instanceof ChainError) {
      return withCors(ApiResponse.error(error.message, error.status), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}
