// src/app/lib/departments/sync-from-staff.ts
//
// The bulk "Sync from Staff Records" reconcile, used by POST /api/departments/sync-from-staff.
//
// It does the same job as calling reconcileStaffDesignationLink + reconcileStaffDepartmentLink once per staff member, but resolves
// each distinct department name and position ONCE and writes in grouped statements. The per-staff version made roughly 15
// sequential queries per person, so a company with 100+ staff took longer than the hosting proxy allows: the browser saw an error
// while the server carried on and finished, which is why a refresh showed the sync had worked.
import { prisma } from '@/app/lib/db'
import { findOrCreateDesignation, normalizeDesignationTitle } from '@/app/lib/designations/designation-sync'
import { resolveDepartmentForStaffText, sanitizeDepartmentName } from './department-sync'

export type SyncSummary = {
  totalStaffChecked: number
  departmentsCreated: number
  departmentsCreatedNames: string[]
  staffRelinked: number
  staffUnchanged: number
  staffWithNoDepartmentText: number
  designationLinksRepaired: number
  designationsCreated: number
}

export type SyncProgress = { phase: string; done: number; total: number }

const key = (s: string) => s.trim().toLowerCase()

async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) {
     
    await fn(items.slice(i, i + size))
  }
}

export async function runSyncFromStaff(
  companyId: string,
  userId: string,
  userName: string,
  onProgress?: (p: SyncProgress) => void,
  opts: { staffIds?: string[] } = {},
): Promise<SyncSummary> {
  const report = (phase: string, done: number, total: number) => onProgress?.({ phase, done, total })

  const staff = await prisma.staffRecord.findMany({
    where: { companyId, isActive: true, ...(opts.staffIds ? { id: { in: opts.staffIds } } : {}) },
    select: { id: true, department: true, departmentId: true, position: true, designationId: true },
  })
  const total = staff.length

  // ---- Designations: resolve each distinct position once.
  report('Matching designations', 0, total)
  const titles = new Map<string, string>() // lower-cased title -> display title
  for (const s of staff) {
    const t = normalizeDesignationTitle(s.position)
    if (t && !titles.has(key(t))) titles.set(key(t), t)
  }
  const designationByTitle = new Map<string, string>()
  let designationsCreated = 0
  for (const [k, title] of titles) {
     
    const { designation, created } = await findOrCreateDesignation(companyId, title)
    designationByTitle.set(k, designation.id)
    if (created) designationsCreated += 1
  }

  const designationMoves = new Map<string, string[]>() // designationId -> staff ids to relink
  const touchedDesignations = new Set<string>(designationByTitle.values())
  let designationLinksRepaired = 0
  for (const s of staff) {
    const t = normalizeDesignationTitle(s.position)
    if (!t) continue
    const target = designationByTitle.get(key(t))
    if (!target || target === s.designationId) continue
    designationMoves.set(target, [...(designationMoves.get(target) || []), s.id])
    if (s.designationId) touchedDesignations.add(s.designationId)
    designationLinksRepaired += 1
  }
  for (const [designationId, ids] of designationMoves) {
     
    await inChunks(ids, 500, (chunk) => prisma.staffRecord.updateMany({ where: { id: { in: chunk } }, data: { designationId } }))
  }
  report('Matching designations', total, total)

  // ---- Departments: resolve each distinct name once (finds or creates it).
  report('Linking departments', 0, total)
  const names = new Map<string, string>()
  for (const s of staff) {
    const n = sanitizeDepartmentName(s.department)
    if (n && !names.has(key(n))) names.set(key(n), s.department as string)
  }
  const departmentByName = new Map<string, string>()
  const departmentsCreatedNames: string[] = []
  for (const [k, raw] of names) {
     
    const resolved = await resolveDepartmentForStaffText(companyId, raw, userId, userName)
    if (!resolved.departmentId) continue
    departmentByName.set(k, resolved.departmentId)
    if (resolved.created && resolved.departmentName) departmentsCreatedNames.push(resolved.departmentName)
  }

  let staffRelinked = 0
  let staffUnchanged = 0
  let staffWithNoDepartmentText = 0
  const departmentMoves = new Map<string, string[]>() // target departmentId -> staff ids
  const history: {
    staffId: string; departmentId: string; companyId: string; action: string; fromDepartmentId: string | null
    toDepartmentId: string; oldPosition: string | null; newPosition: string | null; reason: string; performedBy: string
  }[] = []
  const touchedDepartments = new Set<string>(departmentByName.values())

  for (const s of staff) {
    if (!s.department || !s.department.trim()) {
      staffWithNoDepartmentText += 1
      continue
    }
    const n = sanitizeDepartmentName(s.department)
    const target = n ? departmentByName.get(key(n)) : null
    if (!target || target === s.departmentId) {
      staffUnchanged += 1
      continue
    }
    staffRelinked += 1
    departmentMoves.set(target, [...(departmentMoves.get(target) || []), s.id])
    if (s.departmentId) touchedDepartments.add(s.departmentId)
    history.push({
      staffId: s.id,
      departmentId: target,
      companyId,
      action: s.departmentId ? 'TRANSFERRED' : 'JOINED',
      fromDepartmentId: s.departmentId,
      toDepartmentId: target,
      oldPosition: s.position,
      newPosition: s.position,
      reason: 'Synced from Staff Management',
      performedBy: userId,
    })
  }
  for (const [departmentId, ids] of departmentMoves) {
     
    await inChunks(ids, 500, (chunk) => prisma.staffRecord.updateMany({ where: { id: { in: chunk } }, data: { departmentId } }))
  }
  await inChunks(history, 500, (chunk) => prisma.departmentStaffHistory.createMany({ data: chunk }))
  report('Linking departments', total, total)

  // ---- Counts, once per touched record.
  report('Updating counts', 0, total)
  const headcounts = await prisma.staffRecord.groupBy({
    by: ['departmentId'],
    where: { departmentId: { in: [...touchedDepartments] }, isActive: true },
    _count: { _all: true },
  })
  const headcountOf = new Map(headcounts.map((h) => [h.departmentId as string, h._count._all]))
  await inChunks([...touchedDepartments], 25, (chunk) =>
    Promise.all(chunk.map((id) => prisma.department.update({ where: { id }, data: { activeHeadcount: headcountOf.get(id) || 0 } }))),
  )

  const designationCounts = await prisma.staffRecord.groupBy({
    by: ['designationId'],
    where: { designationId: { in: [...touchedDesignations] } },
    _count: { _all: true },
  })
  const designationCountOf = new Map(designationCounts.map((d) => [d.designationId as string, d._count._all]))
  await inChunks([...touchedDesignations], 25, (chunk) =>
    Promise.all(
      chunk.map((id) => prisma.designation.update({ where: { id }, data: { staffCount: designationCountOf.get(id) || 0 } }).catch(() => null)),
    ),
  )

  // A designation shared by 2+ active people in a department has no seat limit there.
  const pairs = await prisma.staffRecord.groupBy({
    by: ['departmentId', 'designationId'],
    where: { companyId, isActive: true, departmentId: { not: null }, designationId: { not: null } },
    _count: { _all: true },
  })
  const shared = new Map<string, string[]>() // departmentId -> designationIds
  for (const p of pairs) {
    if (p._count._all >= 2 && p.departmentId && p.designationId) shared.set(p.departmentId, [...(shared.get(p.departmentId) || []), p.designationId])
  }
  if (shared.size) {
    const rows = await prisma.department.findMany({ where: { id: { in: [...shared.keys()] } }, select: { id: true, positionCapacity: true } })
    await inChunks(rows, 25, (chunk) =>
      Promise.all(
        chunk.map((d) => {
          const capacity = (d.positionCapacity as Record<string, number | null> | null) || {}
          const missing = (shared.get(d.id) || []).filter((id) => capacity[id] !== null)
          if (!missing.length) return null
          const next = { ...capacity }
          missing.forEach((id) => { next[id] = null })
          return prisma.department.update({ where: { id: d.id }, data: { positionCapacity: next } })
        }),
      ),
    )
  }
  report('Updating counts', total, total)

  return {
    totalStaffChecked: total,
    departmentsCreated: departmentsCreatedNames.length,
    departmentsCreatedNames,
    staffRelinked,
    staffUnchanged,
    staffWithNoDepartmentText,
    designationLinksRepaired,
    designationsCreated,
  }
}
