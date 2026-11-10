// src/app/lib/departments/business-unit-link.ts
//
// A department's business unit is OPTIONAL. Department create/update accept it
// as `businessUnitId` (a BusinessUnit id) or `businessUnit` (a name — what the
// Add/Edit Department form has always sent, under either key). This resolves
// that input to the canonical pair stored on Department:
//   - businessUnitId: the linked BusinessUnit (null when none / no match)
//   - businessUnit:   the display name kept for back-compat (null when none)
// Blank / null input clears both. A name that matches no BusinessUnit is kept
// as the legacy display name only, never rejected.
import { prisma } from '@/app/lib/db'

export type BusinessUnitLink = { businessUnit: string | null; businessUnitId: string | null }

/**
 * Returns the link to store, or `undefined` when the request didn't mention a
 * business unit at all (so an update leaves the current one untouched).
 */
export async function resolveBusinessUnitLink(
  companyId: string,
  body: { businessUnit?: unknown; businessUnitId?: unknown }
): Promise<BusinessUnitLink | undefined> {
  if (body.businessUnitId === undefined && body.businessUnit === undefined) return undefined

  const raw = String((body.businessUnitId ?? body.businessUnit) ?? '').trim()
  if (!raw || raw.toLowerCase() === 'unassigned') return { businessUnit: null, businessUnitId: null }

  const unit = await prisma.businessUnit.findFirst({
    where: {
      companyId,
      OR: [{ archived: 0 }, { archived: null }],
      AND: [{ OR: [{ id: raw }, { name: { equals: raw, mode: 'insensitive' } }] }],
    },
    select: { id: true, name: true },
  })

  return unit ? { businessUnit: unit.name, businessUnitId: unit.id } : { businessUnit: raw, businessUnitId: null }
}

/**
 * A department code is optional too. When none is given, derive one from the
 * name's initials (e.g. "Human Resources" -> "HR"), adding a number if that
 * code is already taken in the company ("HR-2", "HR-3", ...).
 */
export async function generateDepartmentCode(companyId: string, name: string): Promise<string> {
  const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const base = (words.length > 1 ? words.map((w) => w[0]).join('') : words[0] || 'DEPT').slice(0, 6) || 'DEPT'

  const taken = new Set(
    (
      await prisma.department.findMany({
        where: { companyId, code: { startsWith: base, mode: 'insensitive' } },
        select: { code: true },
      })
    ).map((d) => String(d.code || '').toUpperCase())
  )
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`
}
