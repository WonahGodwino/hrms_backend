import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { canManagePhedRolesForCompany, requirePhedRoleManagementAccess } from '@/app/lib/phed/access-role'
import { notifyPhedAccessRoleChange } from '@/app/lib/phed/access-role-notifications'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function DELETE(req: NextRequest, { params }: { params: { staffRecordId: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedRoleManagementAccess(token)
    const body = await req.json().catch(() => ({}))
    const requestedCompanyId = typeof body?.companyId === 'string' ? body.companyId : null
    const companyId = requestedCompanyId || user.companyId
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    if (!companyId || !await canManagePhedRolesForCompany(user, companyId)) {
      return withCors(ApiResponse.forbidden('You are not assigned to manage PHED roles for this company'), origin)
    }
    if (!reason || reason.length > 1000) {
      return withCors(ApiResponse.error('A role-revocation reason between 1 and 1000 characters is required', 400), origin)
    }

    const [assignment, actor] = await Promise.all([
      prisma.phedStaffAccessRole.findFirst({
        where: { staffRecordId: params.staffRecordId, companyId },
        include: { staffRecord: { select: { firstName: true, lastName: true } } },
      }),
      prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } }),
    ])
    if (!assignment) return withCors(ApiResponse.notFound('PHED role assignment not found'), origin)

    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'Unknown'
    await prisma.$transaction(async tx => {
      await tx.phedAccessRoleChange.create({
        data: {
          companyId,
          staffRecordId: params.staffRecordId,
          action: 'REVOKED',
          previousRole: assignment.accessRole,
          newRole: null,
          reason,
          changedById: user.userId,
          changedByName: actorName,
          changedByRole: user.phedAccessRole ?? user.role,
        },
      })
      await tx.phedStaffAccessRole.delete({ where: { id: assignment.id } })
    })

    notifyPhedAccessRoleChange({
      companyId,
      targetName: `${assignment.staffRecord.firstName} ${assignment.staffRecord.lastName}`,
      action: 'REVOKED',
      previousRole: assignment.accessRole,
      newRole: null,
      reason,
      changedByName: actorName,
    }).catch(error => console.error('PHED access-role revocation notification failed:', error))

    return withCors(ApiResponse.success(null, 'PHED role revoked'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
