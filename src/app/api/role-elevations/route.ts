// GET  /api/role-elevations?companyId=&status=  — list elevations for a company
// POST /api/role-elevations                      — grant a temporary elevation
//
// A temporary elevation lets an ADMIN/HR give a staff member a higher access
// role (ADMIN/HR) for an urgent task (e.g. sitting on an interview panel). The
// base role is never changed; revoking/expiry returns them to it. Grant rules:
//   ADMIN / SUPER_ADMIN → may grant ADMIN or HR
//   HR                  → may grant HR only
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'
import { canGrantRole, rankOf } from '@/app/lib/role-elevation'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// Default lifetime when the caller doesn't specify one (every elevation expires).
const DEFAULT_DURATION_HOURS = 8

const staffName = (s: any) => `${s?.firstName || ''} ${s?.lastName || ''}`.trim()

// Flip any ACTIVE rows whose expiry has passed to EXPIRED (self-healing) so the
// DB status matches reality — cheap, company-scoped, runs on list reads.
async function sweepExpired(companyId: string) {
  try {
    await (prisma as any).roleElevation.updateMany({
      where: { companyId, status: 'ACTIVE', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    })
  } catch (e) {
    console.error('[ROLE_ELEVATION] expiry sweep failed (non-critical):', e)
  }
}

// Effective (display) status: an ACTIVE row whose expiry has passed reads as EXPIRED.
function displayStatus(e: any): string {
  if (e.status === 'ACTIVE' && e.expiresAt && new Date(e.expiresAt).getTime() <= Date.now()) return 'EXPIRED'
  return e.status
}

function serialize(e: any) {
  const status = displayStatus(e)
  return {
    id: e.id,
    staffId: e.staffId,
    staffName: staffName(e.staff),
    staffEmail: e.staff?.email || '',
    baseRole: e.fromRole,
    elevatedRole: e.toRole,
    reason: e.reason,
    status,
    active: status === 'ACTIVE',
    grantedBy: e.grantedByName || '',
    grantedByRole: e.grantedByRole || '',
    grantedAt: e.createdAt,
    revokedBy: e.revokedByName || null,
    revokedAt: e.revokedAt || null,
    expiresAt: e.expiresAt || null,
  }
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(req.url)

    const scope = await resolveScopedCompanyId(user, searchParams.get('companyId'))
    if (scope.forbidden) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    if (!scope.companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
    const companyId = scope.companyId

    const statusFilter = (searchParams.get('status') || '').trim().toUpperCase()

    // Reconcile lapsed elevations before reading so statuses are accurate.
    await sweepExpired(companyId)

    const where: any = { companyId }
    if (statusFilter && ['ACTIVE', 'REVOKED', 'EXPIRED'].includes(statusFilter)) where.status = statusFilter

    const rows = await (prisma as any).roleElevation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { staff: { select: { firstName: true, lastName: true, email: true } } },
    })

    return withCors(ApiResponse.success(rows.map(serialize), 'Role elevations fetched'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await req.json().catch(() => ({}))

    const scope = await resolveScopedCompanyId(user, body?.companyId || null)
    if (scope.forbidden) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    if (!scope.companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)
    const companyId = scope.companyId

    const staffId = String(body.staffId || '').trim()
    const toRole = String(body.toRole || '').trim().toUpperCase()
    const reason = String(body.reason || '').trim()

    if (!staffId) return withCors(ApiResponse.error('Select a staff member', 400), origin)
    if (!reason) return withCors(ApiResponse.error('A reason for the elevation is required', 400), origin)

    // Role rule: HR may grant HR only; ADMIN/SUPER_ADMIN may grant ADMIN or HR.
    if (!canGrantRole(user.role, toRole)) {
      return withCors(ApiResponse.error(
        user.role === 'HR'
          ? 'HR can only assign the HR role'
          : `You cannot assign the ${toRole || 'selected'} role`,
        403), origin)
    }

    // Mandatory auto-expiry so an elevation always has a maximum lifetime and can
    // never linger if someone forgets to revoke. Defaults to 8h; clamp 1..168h.
    let hrs = DEFAULT_DURATION_HOURS
    if (body.durationHours !== undefined && body.durationHours !== null && body.durationHours !== '') {
      hrs = Math.round(Number(body.durationHours))
    }
    if (!Number.isFinite(hrs) || hrs < 1 || hrs > 168) {
      return withCors(ApiResponse.error('Duration must be a whole number of hours between 1 and 168', 400), origin)
    }
    const expiresAt = new Date(Date.now() + hrs * 60 * 60 * 1000)

    // Target must be a staff member of this company.
    const staff = await prisma.staffRecord.findFirst({
      where: { id: staffId, companyId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    })
    if (!staff) return withCors(ApiResponse.error('Staff member not found in this company', 404), origin)

    // No-op if they already hold equal/greater access by their base role.
    if (rankOf(staff.role) >= rankOf(toRole)) {
      return withCors(ApiResponse.error(`This staff member already has ${staff.role} access`, 409), origin)
    }

    // One active elevation per staff/company — revoke the existing one first.
    // Only a non-expired ACTIVE row blocks (an ACTIVE-but-lapsed one doesn't).
    const existingActive = await (prisma as any).roleElevation.findFirst({
      where: {
        staffId, companyId, status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    })
    if (existingActive) {
      return withCors(ApiResponse.error('This staff member already has an active elevation. Revoke it first.', 409), origin)
    }

    // Granter's display name.
    const granter = await prisma.staffRecord.findFirst({
      where: { id: user.userId },
      select: { firstName: true, lastName: true },
    })

    const created = await (prisma as any).roleElevation.create({
      data: {
        companyId,
        staffId,
        fromRole: staff.role || 'STAFF',
        toRole,
        reason,
        status: 'ACTIVE',
        grantedBy: user.userId,
        grantedByName: granter ? `${granter.firstName || ''} ${granter.lastName || ''}`.trim() : (user.email || ''),
        grantedByRole: user.role,
        expiresAt,
      },
      include: { staff: { select: { firstName: true, lastName: true, email: true } } },
    })

    return withCors(ApiResponse.success(serialize(created),
      `${staffName(created.staff)} elevated to ${toRole}.`, 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
