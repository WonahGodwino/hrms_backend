// POST /api/role-elevations/:id/revoke
// Ends a temporary elevation early — the staff member reverts to their base role
// on their next request. Revoke rules mirror grant rules: HR can only revoke HR
// elevations; ADMIN/SUPER_ADMIN can revoke any.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'
import { canManageRole } from '@/app/lib/role-elevation'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    // Load the elevation, then verify the caller can access its company.
    const elevation = await (prisma as any).roleElevation.findFirst({
      where: { id },
      include: { staff: { select: { firstName: true, lastName: true } } },
    })
    if (!elevation) return withCors(ApiResponse.error('Role elevation not found', 404), origin)

    const scope = await resolveScopedCompanyId(user, elevation.companyId)
    if (scope.forbidden || scope.companyId !== elevation.companyId) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    // Role rule: HR may only revoke HR elevations.
    if (!canManageRole(user.role, elevation.toRole)) {
      return withCors(ApiResponse.error('HR can only manage HR-role elevations', 403), origin)
    }

    if (elevation.status !== 'ACTIVE') {
      return withCors(ApiResponse.error('This elevation is no longer active', 409), origin)
    }

    const revoker = await prisma.staffRecord.findFirst({
      where: { id: user.userId },
      select: { firstName: true, lastName: true },
    })

    await (prisma as any).roleElevation.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedBy: user.userId,
        revokedByName: revoker ? `${revoker.firstName || ''} ${revoker.lastName || ''}`.trim() : (user.email || ''),
        revokedAt: new Date(),
        reason: body?.note ? `${elevation.reason} | Revoked: ${String(body.note).trim()}` : elevation.reason,
      },
    })

    const name = `${elevation.staff?.firstName || ''} ${elevation.staff?.lastName || ''}`.trim()
    return withCors(ApiResponse.success({ id, status: 'REVOKED' },
      `${name || 'Staff'} reverted to their ${elevation.fromRole} role.`), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
