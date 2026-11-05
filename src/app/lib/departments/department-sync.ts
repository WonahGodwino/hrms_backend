// src/app/lib/departments/department-sync.ts
//
// Reconciles StaffRecord.department (free text — the field every staff
// write path actually sets: bulk upload, bulk-edit upload, the Staff Edit
// modal, recruitment onboarding, and registration) against the relational
// Department model + StaffRecord.departmentId FK that the Core Setup
// Department module owns. Staff Management's free text is the source of
// truth: this module auto-creates the Department a staff's text names (if
// none exists yet) and keeps departmentId pointed at it, including
// re-linking a staff whose text no longer matches their current department.
//
// Called from two triggers — inline, right after any staff write that sets
// `department` (see the individual route handlers), and in bulk from
// POST /api/departments/sync-from-staff for backfilling pre-existing drift.
// Both call the same functions here; there's no reason to duplicate this
// logic the way payroll generation deliberately duplicates the upload path —
// this is one feature, not two systems that must stay independently provable.
import { prisma } from '@/app/lib/db'
import { logDepartmentAction, logStaffDepartmentChange, updateDepartmentHeadcount } from './department-utils'

/**
 * Title-cases a free-text department name: trims, collapses internal
 * whitespace, and capitalizes the first letter of every word (so "human
 * resources" / "HUMAN RESOURCES" / "human   resources" all normalize to the
 * same canonical "Human Resources"). Returns null for blank/whitespace-only
 * input — callers treat that as "no department info", not "unassign".
 */
export function sanitizeDepartmentName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  return collapsed
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ')
}

/**
 * Derives a short department `code` from a sanitized name — initials of
 * each word (e.g. "Human Resources" -> "HR"), or the first few letters for
 * a single-word name (e.g. "Sales" -> "SAL"). Appends a numeric suffix on
 * collision with an existing (companyId, code) until one is free.
 */
async function generateDepartmentCode(companyId: string, name: string): Promise<string> {
  const words = name.split(' ').filter(Boolean)
  let base: string
  if (words.length > 1) {
    base = words.map((w) => w.charAt(0).toUpperCase()).join('')
  } else {
    base = (words[0] || 'DEPT').slice(0, 3).toUpperCase()
  }
  if (!base) base = 'DEPT'

  let candidate = base
  let suffix = 2
  // Small, bounded loop — number of collisions on a company's department
  // codes is never large enough to matter performance-wise.
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.department.findFirst({ where: { companyId, code: candidate }, select: { id: true } })) {
    candidate = `${base}${suffix}`
    suffix += 1
  }
  return candidate
}

/**
 * Resolves a staff's free-text department to a real Department id, scoped
 * to the company — finding an existing one (case-insensitive) or creating
 * it (Title Case name, auto-generated code) if none exists yet.
 */
async function resolveDepartmentForStaffText(
  companyId: string,
  rawDepartmentText: string | null | undefined,
  performedBy: string,
  performedByName: string
): Promise<{ departmentId: string | null; departmentName: string | null; created: boolean }> {
  const name = sanitizeDepartmentName(rawDepartmentText)
  if (!name) return { departmentId: null, departmentName: null, created: false }

  const existing = await prisma.department.findFirst({
    where: { companyId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true }
  })
  if (existing) return { departmentId: existing.id, departmentName: existing.name, created: false }

  const code = await generateDepartmentCode(companyId, name)
  const created = await prisma.department.create({
    data: { name, code, companyId, status: 'Active', activeHeadcount: 0 }
  })

  await logDepartmentAction(
    created.id,
    companyId,
    `Created department: ${name} (${code}) — auto-created from Staff Management`,
    performedBy,
    performedByName,
    'create',
    { name, code, source: 'staff-sync' }
  )

  return { departmentId: created.id, departmentName: created.name, created: true }
}

/**
 * Reconciles one staff member's departmentId against their free-text
 * department. Non-destructive: a blank/unrecognized department text never
 * clears an existing departmentId — it's only ever relinked when the text
 * resolves to a *different*, non-blank department name.
 */
export async function reconcileStaffDepartmentLink(
  staffId: string,
  companyId: string,
  rawDepartmentText: string | null | undefined,
  currentDepartmentId: string | null,
  currentPosition: string | null,
  performedBy: string,
  performedByName: string
): Promise<{ changed: boolean; departmentId: string | null; departmentCreated: boolean }> {
  const resolved = await resolveDepartmentForStaffText(companyId, rawDepartmentText, performedBy, performedByName)

  if (!resolved.departmentId || resolved.departmentId === currentDepartmentId) {
    return { changed: false, departmentId: currentDepartmentId, departmentCreated: resolved.created }
  }

  await prisma.staffRecord.update({
    where: { id: staffId },
    data: { departmentId: resolved.departmentId }
  })

  await logStaffDepartmentChange(
    staffId,
    currentDepartmentId,
    resolved.departmentId,
    currentPosition,
    currentPosition,
    performedBy,
    'Synced from Staff Management'
  )

  await updateDepartmentHeadcount(resolved.departmentId)
  if (currentDepartmentId) await updateDepartmentHeadcount(currentDepartmentId)

  return { changed: true, departmentId: resolved.departmentId, departmentCreated: resolved.created }
}
