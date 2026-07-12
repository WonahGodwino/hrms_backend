// Temporary role-elevation overlay. An elevation grants a staff member a higher
// access role (ADMIN/HR) within a company for a limited time / task. The base
// role is never mutated — the effective role is resolved at auth time by
// overlaying any ACTIVE, non-expired elevation on top of the base role.
import { prisma } from '@/app/lib/db'

// Higher number = more privilege. Used so an elevation only ever UPGRADES.
export const ROLE_RANK: Record<string, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  HR: 2,
  MANAGER: 1,
  STAFF: 0,
}

export function rankOf(role?: string | null): number {
  return ROLE_RANK[String(role || '').toUpperCase()] ?? 0
}

// Roles that can be temporarily granted.
export const GRANTABLE_ROLES = ['ADMIN', 'HR'] as const

// Who may GRANT which elevated role:
//   ADMIN / SUPER_ADMIN → may grant ADMIN or HR
//   HR                  → may grant HR only
export function canGrantRole(granterRole: string, targetRole: string): boolean {
  const g = String(granterRole || '').toUpperCase()
  const t = String(targetRole || '').toUpperCase()
  if (t !== 'ADMIN' && t !== 'HR') return false
  if (g === 'SUPER_ADMIN' || g === 'ADMIN') return true
  if (g === 'HR') return t === 'HR'
  return false
}

// Who may REVOKE an existing elevation of a given role. Same rule as granting:
// HR can only touch HR elevations; ADMIN/SUPER_ADMIN can touch any.
export function canManageRole(actorRole: string, elevatedRole: string): boolean {
  const a = String(actorRole || '').toUpperCase()
  const t = String(elevatedRole || '').toUpperCase()
  if (a === 'SUPER_ADMIN' || a === 'ADMIN') return true
  if (a === 'HR') return t === 'HR'
  return false
}

// The roles a given actor is allowed to grant (for the UI to filter options).
export function grantableRolesFor(actorRole: string): string[] {
  return GRANTABLE_ROLES.filter((r) => canGrantRole(actorRole, r))
}

// The elevated role currently in force for a staff member in a company, or null.
// Only ACTIVE elevations whose expiry (if any) is still in the future count.
export async function getActiveElevatedRole(
  staffId: string,
  companyId: string,
): Promise<string | null> {
  if (!staffId || !companyId) return null
  try {
    const now = new Date()
    const elevation = await (prisma as any).roleElevation.findFirst({
      where: {
        staffId,
        companyId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { toRole: true },
    })
    return elevation?.toRole || null
  } catch (e) {
    // Never let the overlay break authentication.
    console.error('[ROLE_ELEVATION] lookup failed (non-critical):', e)
    return null
  }
}
