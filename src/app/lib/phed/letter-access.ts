// ============================================================
// PHED Promotion Letters — role-based access guards.
//
// The feature lives INSIDE the PHED module (no new module key). Guards map the
// PRD's roles onto the platform's global roles + PHED access roles, exactly as
// the Payroll Engine does:
//
//   People Operator → global HR / ADMIN / SUPER_ADMIN   (create + view own runs)
//   Administrator   → global ADMIN / SUPER_ADMIN         (template management)
//   Auditor         → HR / ADMIN / SUPER_ADMIN  OR  PHED HEAD_INTERNAL_AUDIT (read-only)
//   Signatory       → no login (static template config)
//   Recipient       → no login
// ============================================================

import { requireModuleAccess } from '@/app/lib/module-access'
import type { AuthUser } from '@/app/lib/auth'
import { getPhedAccessRole } from './access-role'

const ANY_GLOBAL_ROLE = ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF', 'CEO', 'MD', 'MD_CEO']

/** People Operator — upload, validate, preview, generate, download. */
export async function requireLetterOperatorAccess(token: string | null): Promise<AuthUser> {
  return requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
}

/** Administrator — maintain the letter template, letterhead and signatory (HR + ADMIN + SUPER_ADMIN). */
export async function requireLetterAdminAccess(token: string | null): Promise<AuthUser> {
  return requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])
}

/**
 * Auditor — read-only. Global HR/ADMIN/SUPER_ADMIN, or a PHED
 * HEAD_INTERNAL_AUDIT holder. Used only on GET endpoints (history + audit).
 */
export async function requireLetterAuditAccess(token: string | null): Promise<AuthUser> {
  const user = await requireModuleAccess(token, 'PHED', ANY_GLOBAL_ROLE)

  if (['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) return user

  const accessRole = await getPhedAccessRole(user.userId)
  if (accessRole === 'HEAD_INTERNAL_AUDIT') return user

  throw new Error('Insufficient permissions. Required: HR, ADMIN, SUPER_ADMIN, or Head, Internal Audit.')
}
