import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import type { AuthUser } from '@/app/lib/auth'
import { PhedAccessRole, PhedPageKey } from '@prisma/client'

export interface PhedAuthUser extends AuthUser {
  phedAccessRole: PhedAccessRole
}

// PHED approval/access roles (Module 12 & 13) are deliberately independent
// of StaffRecord.role — a holder may be global STAFF. The real gate here is
// the PhedStaffAccessRole lookup, so every global role is let through.
const ANY_GLOBAL_ROLE = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF']

// Always a fresh DB read — never trust a JWT-embedded value, since a PHED
// role can be reseeded/changed without the holder re-logging in.
export async function getPhedAccessRole(staffRecordId: string): Promise<PhedAccessRole | null> {
  const grant = await prisma.phedStaffAccessRole.findUnique({
    where: { staffRecordId },
    select: { accessRole: true },
  })
  return grant?.accessRole ?? null
}

// Companion to requireModuleAccess for routes gated by a PHED-specific
// approval/access role rather than the global `role` field.
export async function requirePhedAccessRole(
  token: string | null,
  allowedAccessRoles: PhedAccessRole[],
): Promise<PhedAuthUser> {
  const user = await requireModuleAccess(token, 'PHED', ANY_GLOBAL_ROLE)

  const accessRole = await getPhedAccessRole(user.userId)
  if (!accessRole || !allowedAccessRoles.includes(accessRole)) {
    throw new Error(`Insufficient permissions. Required PHED role: ${allowedAccessRoles.join(', ')}`)
  }

  return { ...user, phedAccessRole: accessRole }
}

// The 5 roles that hold a desk in the Module 12 approval chain (excludes the
// 3 page-access-only roles: Treasury, Financial Reporting, Tax).
export const PHED_APPROVAL_CHAIN_ROLES: PhedAccessRole[] = [
  'MANAGER_COMP_BENEFITS',
  'HEAD_INTERNAL_AUDIT',
  'CHIEF_PEOPLE_OFFICER',
  'CHIEF_FINANCE_OFFICER',
  'MD_CEO',
]

// Archive/detail/PDF routes are open to "All 5 approval roles, HR Admin"
// (PRD 12.7) — two independent ways in, neither implying the other.
export async function requirePhedApprovalAccess(
  token: string | null,
): Promise<AuthUser & { phedAccessRole: PhedAccessRole | null }> {
  const user = await requireModuleAccess(token, 'PHED', ANY_GLOBAL_ROLE)

  if (['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return { ...user, phedAccessRole: await getPhedAccessRole(user.userId) }
  }

  const accessRole = await getPhedAccessRole(user.userId)
  if (accessRole && PHED_APPROVAL_CHAIN_ROLES.includes(accessRole)) {
    return { ...user, phedAccessRole: accessRole }
  }

  throw new Error('Insufficient permissions. Required: one of the 5 PHED approval roles, or HR/ADMIN')
}

// Read-only guard for pay-period data and reports — allows HR/ADMIN/SUPER_ADMIN
// OR any of the 8 PHED access roles (approval chain + page-access-only roles).
// Use this on every GET endpoint that the 8 PHED roles need to read.
export async function requirePhedReadAccess(
  token: string | null,
): Promise<AuthUser & { phedAccessRole: PhedAccessRole | null }> {
  const user = await requireModuleAccess(token, 'PHED', ANY_GLOBAL_ROLE)

  if (['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return { ...user, phedAccessRole: await getPhedAccessRole(user.userId) }
  }

  const accessRole = await getPhedAccessRole(user.userId)
  if (accessRole) {
    return { ...user, phedAccessRole: accessRole }
  }

  throw new Error('Insufficient permissions. Required: HR/ADMIN access or an assigned PHED role.')
}

// Module 13 — page-level guard. HR/ADMIN/SUPER_ADMIN keep the full access
// they already have on these routes (unchanged from before this module).
// Every other PHED access role is checked against PhedRoleAccessGrant for
// the specific pageKey — independent of, and layered in front of, the
// approval-action permission above (PRD 12.2 / 13.1).
export async function requirePhedPageAccess(
  token: string | null,
  pageKey: PhedPageKey,
): Promise<AuthUser & { phedAccessRole: PhedAccessRole | null }> {
  const user = await requireModuleAccess(token, 'PHED', ANY_GLOBAL_ROLE)

  if (['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return { ...user, phedAccessRole: await getPhedAccessRole(user.userId) }
  }

  const accessRole = await getPhedAccessRole(user.userId)
  if (!accessRole) {
    throw new Error('Insufficient permissions. No PHED access role assigned.')
  }

  const grant = await prisma.phedRoleAccessGrant.findUnique({
    where: { companyId_accessRole_pageKey: { companyId: user.companyId!, accessRole, pageKey } },
  })
  if (!grant) {
    throw new Error(`Insufficient permissions. Your PHED role (${accessRole}) does not have access to this page.`)
  }

  return { ...user, phedAccessRole: accessRole }
}
