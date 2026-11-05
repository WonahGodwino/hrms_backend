// src/app/lib/payroll/utils/staff-matching.ts
//
// Deterministic staff matching for payroll UPLOAD processing (ISURF, Blueridge,
// Dynamic). All three processors used to match each Excel row with per-row DB
// queries and an inconsistent priority order (ISURF had no staffId step at all),
// falling back to a fuzzy `contains` name match that could bind a row to the
// WRONG staff member. On large files that meant duplicates, wrong figures, and
// records "from nowhere".
//
// This module loads every active staff record for the company ONCE and matches
// rows in memory with a single, strict rule:
//
//   1. staffId  — if present on the row and found in the company, use it.
//   2. email    — only when staffId is absent or not found; matched
//                 case-insensitively (normalized to lowercase).
//   3. otherwise — no match. Callers must fail/skip the row. NAME IS NEVER USED.
//
// Case-insensitive email matching is done here (via the index key) rather than
// relying on the DB `email_companyId` unique lookup, because staff emails are
// stored as-entered and may differ only in case from the uploaded value.

import { prisma } from '@/app/lib/db'

// Full scalar StaffRecord shape — matches what the previous per-row
// findUnique/findFirst calls returned (all scalar columns, no relations).
export type IndexedStaff = NonNullable<
  Awaited<ReturnType<typeof prisma.staffRecord.findUnique>>
>

export interface StaffIndex {
  byStaffId: Map<string, IndexedStaff>
  byEmail: Map<string, IndexedStaff>
  size: number
}

/**
 * Normalize an email for matching: coerce to string, trim, lowercase.
 * Returns '' for null/undefined/blank so callers can treat it as absent.
 */
export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

/** Trim a staffId; '' means absent. */
export function normalizeStaffId(raw: unknown): string {
  return String(raw ?? '').trim()
}

/**
 * Load all active staff for a company once and build staffId + lowercased-email
 * lookup maps. One DB query regardless of how many rows the upload has.
 */
export async function buildStaffIndex(companyId: string): Promise<StaffIndex> {
  const staff = await prisma.staffRecord.findMany({
    where: { companyId, isActive: true },
  })

  const byStaffId = new Map<string, IndexedStaff>()
  const byEmail = new Map<string, IndexedStaff>()

  for (const record of staff) {
    const sid = normalizeStaffId(record.staffId)
    if (sid && !byStaffId.has(sid)) byStaffId.set(sid, record)

    const email = normalizeEmail(record.email)
    if (email && !byEmail.has(email)) byEmail.set(email, record)
  }

  return { byStaffId, byEmail, size: staff.length }
}

/**
 * Match a single row to a staff record using staffId first, then email.
 * Returns null when neither resolves — the caller must fail/skip the row.
 * Name is intentionally never considered.
 */
export function matchStaff(
  index: StaffIndex,
  row: { staffId?: unknown; email?: unknown }
): IndexedStaff | null {
  const sid = normalizeStaffId(row.staffId)
  if (sid) {
    const byId = index.byStaffId.get(sid)
    if (byId) return byId
  }

  const email = normalizeEmail(row.email)
  if (email) {
    const byEmail = index.byEmail.get(email)
    if (byEmail) return byEmail
  }

  return null
}
