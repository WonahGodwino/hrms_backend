import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import type { AuthUser } from '@/app/lib/auth'
import { PhedAccessRole, PhedPageKey } from '@prisma/client'

export interface PhedAuthUser extends AuthUser {
  phedAccessRole: PhedAccessRole
}

export interface PhedRoleManagementUser extends AuthUser {
  phedAccessRole: PhedAccessRole | null
  position: string | null
}

// PHED approval/access roles (Module 12 & 13) are deliberately independent
// of StaffRecord.role — a holder may be global STAFF. The real gate here is
// the PhedStaffAccessRole lookup, so every global role is let through.
const ANY_GLOBAL_ROLE = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF', 'CEO', 'MD', 'MD_CEO']

export const PHED_ACCESS_ROLES: PhedAccessRole[] = [
  'MANAGER_COMP_BENEFITS',
  'TAX_AUDIT',
  'HEAD_INTERNAL_AUDIT',
  'CHIEF_PEOPLE_OFFICER',
  'CHIEF_FINANCE_OFFICER',
  'MD_CEO',
  'TREASURY_TEAM',
  'FINANCIAL_REPORTING_TEAM',
  'TAX_TEAM',
]

export function hasCeoMdTitle(positionOrRole?: string | null): boolean {
  return /\b(ceo|chief executive officer|md|managing director)\b/i.test(positionOrRole ?? '')
}

// Role governance is distinct from payroll approval. HR/Admin can maintain
// assignments; a CEO/MD may do the same from their staff title or PHED role.
// Neither permission grants an approval stage without an assignment.
export async function requirePhedRoleManagementAccess(
  token: string | null,
): Promise<PhedRoleManagementUser> {
  const user = await requireModuleAccess(token, 'PHED', ANY_GLOBAL_ROLE)
  const [grant, staff] = await Promise.all([
    getPhedAccessRole(user.userId),
    prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { position: true, role: true } }),
  ])

  const isGlobalManager = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)
  const isCeoMd = grant === 'MD_CEO' || hasCeoMdTitle(staff?.position) || hasCeoMdTitle(staff?.role) || hasCeoMdTitle(user.role)
  if (!isGlobalManager && !isCeoMd) {
    throw new Error('Insufficient permissions. Required: HR, ADMIN, SUPER_ADMIN, or CEO/MD.')
  }

  return { ...user, phedAccessRole: grant, position: staff?.position ?? null }
}

// The global company selector is advisory. Every role-management API call
// independently verifies the selected company before reading or changing data.
// HR/Admin scope comes from user_companies; CEO/MD users are limited to their
// own StaffRecord company unless they are also a SUPER_ADMIN.
export async function canManagePhedRolesForCompany(
  user: PhedRoleManagementUser,
  companyId: string,
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true

  if (user.role === 'HR' || user.role === 'ADMIN') {
    const allowedRoles = user.role === 'HR' ? ['HR', 'ALL'] : ['ADMIN', 'ALL']
    const assignment = await prisma.userCompany.findFirst({
      where: { userId: user.userId, companyId, role: { in: allowedRoles } },
      select: { id: true },
    })
    return Boolean(assignment)
  }

  const staff = await prisma.staffRecord.findUnique({
    where: { id: user.userId },
    select: { companyId: true },
  })
  return staff?.companyId === companyId
}

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
// 3 page-access-only roles: Treasury, Financial Reporting, Tax — and excludes
// MANAGER_COMP_BENEFITS, whose Stage 1 desk is filled by the payroll uploader).
export const PHED_APPROVAL_CHAIN_ROLES: PhedAccessRole[] = [
  'TAX_AUDIT',
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
