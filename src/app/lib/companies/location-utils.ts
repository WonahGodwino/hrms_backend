// src/app/lib/companies/location-utils.ts
// Helpers for company location codes and updates, shared by the
// /companies/:id/locations routes.
import { prisma } from '@/app/lib/db'

type Db = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Derives a 3-letter code prefix from the state (preferred) or location name.
export function deriveLocationPrefix(state?: string | null, name?: string | null): string {
  const fromState = String(state || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3)
  if (fromState.length >= 2) return fromState.padEnd(3, 'X')
  const fromName = String(name || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3)
  return (fromName || 'LOC').padEnd(3, 'X')
}

// Generates the next available "PREFIX-NNN" code for a company, scanning the
// existing codes with that prefix and incrementing. `extraTaken` lets callers
// reserve codes generated in the same batch but not yet persisted.
export async function generateLocationCode(
  db: Db,
  companyId: string,
  state?: string | null,
  name?: string | null,
  extraTaken?: Set<string>
): Promise<string> {
  const prefix = deriveLocationPrefix(state, name)

  const existing = await (db as typeof prisma).location.findMany({
    where: { companyId, code: { startsWith: `${prefix}-` } },
    select: { code: true },
  })

  const taken = new Set<string>(existing.map((e) => e.code!).filter(Boolean))
  if (extraTaken) extraTaken.forEach((c) => taken.add(c))

  let n = taken.size + 1
  let code = `${prefix}-${String(n).padStart(3, '0')}`
  while (taken.has(code)) {
    n += 1
    code = `${prefix}-${String(n).padStart(3, '0')}`
  }
  return code
}

export type LocationUpdateResult =
  | { ok: true; location: { id: string; code: string | null } }
  | { ok: false; status: number; message: string }

// Applies a partial update to a location within a company. Enforces a single
// Head Office: promoting a location to "HQ" demotes any other HQ to "Branch".
export async function updateCompanyLocation(
  companyId: string,
  locationId: string,
  fields: { name?: unknown; type?: unknown; country?: unknown; state?: unknown; lga?: unknown; address?: unknown }
): Promise<LocationUpdateResult> {
  const location = await prisma.location.findFirst({ where: { id: locationId, companyId } })
  if (!location) {
    return { ok: false, status: 404, message: 'Location not found' }
  }

  const data: Record<string, any> = {}
  if (fields.name !== undefined) {
    const name = String(fields.name).trim()
    if (!name) return { ok: false, status: 400, message: 'name cannot be empty' }
    data.name = name
  }
  if (fields.type !== undefined) data.type = fields.type ? String(fields.type).trim() : null
  if (fields.country !== undefined) data.country = fields.country ? String(fields.country).trim() : null
  if (fields.state !== undefined) data.state = fields.state ? String(fields.state).trim() : null
  if (fields.lga !== undefined) data.lga = fields.lga ? String(fields.lga).trim() : null
  if (fields.address !== undefined) data.address = fields.address ? String(fields.address).trim() : null

  const promotingToHq =
    data.type && String(data.type).toUpperCase() === 'HQ' &&
    String(location.type || '').toUpperCase() !== 'HQ'

  const updated = await prisma.$transaction(async (tx) => {
    if (promotingToHq) {
      // Single Head Office invariant: demote the current HQ(s) to Branch.
      await tx.location.updateMany({
        where: { companyId, type: 'HQ', id: { not: locationId } },
        data: { type: 'Branch' },
      })
    }
    return tx.location.update({ where: { id: location.id }, data })
  })

  return { ok: true, location: { id: updated.id, code: updated.code } }
}
