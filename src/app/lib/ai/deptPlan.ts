// [ai-assistant] Builds and validates the plan for a department proposal (department head or business unit).
// The business unit is compared by name because the department update endpoint saves the name (it ignores businessUnitId).
//
// Same rules as staffPlan.ts: the model supplies references (department names or codes, a head's staff number or email, a business
// unit name), everything else is read from the company's own records, so what an approver sees is what will be applied.
import type { PrismaClient } from '@prisma/client'
import { MAX_STEPS, buildPlan, type PlanAssumption, type PlanStep, type ProposalPlan } from './proposals'
import type { Skipped } from './staffPlan'

export type DepartmentChangeField = 'head' | 'businessUnit'
export const DEPARTMENT_CHANGE_FIELDS: DepartmentChangeField[] = ['head', 'businessUnit']

export interface DepartmentChangeRequest {
  departments: string[]
  field: DepartmentChangeField
  value: string
}

export type DepartmentPlanResult =
  | { ok: false; error: string }
  | { ok: true; plan: ProposalPlan; title: string; skipped: Skipped[] }

const clean = (v: unknown) => String(v ?? '').trim()
const same = (a: unknown, b: unknown) => clean(a).toLowerCase() === clean(b).toLowerCase()
const fullName = (s: { firstName: string; lastName: string; email?: string }) => `${s.firstName} ${s.lastName}`.trim() || s.email || 'Staff member'

function nameList(names: string[]): string {
  const shown = names.slice(0, 20)
  return shown.join(', ') + (names.length > shown.length ? ` and ${names.length - shown.length} more` : '')
}

export async function buildDepartmentChangePlan(db: PrismaClient, companyId: string, req: DepartmentChangeRequest): Promise<DepartmentPlanResult> {
  const refs = [...new Set((req.departments ?? []).map(clean).filter(Boolean))]
  const value = clean(req.value)
  if (!DEPARTMENT_CHANGE_FIELDS.includes(req.field)) return { ok: false, error: 'field must be head or businessUnit.' }
  if (!refs.length) return { ok: false, error: 'Provide at least one department name in "departments".' }
  if (refs.length > MAX_STEPS) return { ok: false, error: `A proposal can cover at most ${MAX_STEPS} departments. Split it into several proposals.` }
  if (!value) return { ok: false, error: 'Provide the new value.' }

  const all = await db.department.findMany({
    where: { companyId },
    select: { id: true, name: true, code: true, status: true, headId: true, businessUnit: true },
  })
  const found = refs.map((ref) => ({ ref, matches: all.filter((d) => same(d.name, ref) || same(d.code, ref)) }))
  const unknown = found.filter((f) => f.matches.length === 0).map((f) => f.ref)
  if (unknown.length) return { ok: false, error: `No department found for: ${nameList(unknown)}. Use names from list_departments.` }
  const ambiguous = found.filter((f) => f.matches.length > 1).map((f) => f.ref)
  if (ambiguous.length) return { ok: false, error: `More than one department matches: ${nameList(ambiguous)}.` }

  const skipped: Skipped[] = []
  const targets = found.map((f) => f.matches[0]).filter((d) => {
    if (d.status === 'Active') return true
    skipped.push({ ref: d.name, reason: 'inactive departments are not changed' })
    return false
  })

  const steps: PlanStep[] = []
  const assumptions: PlanAssumption[] = []
  let title = ''

  if (req.field === 'head') {
    const head = await db.staffRecord.findFirst({
      where: { companyId, isActive: true, OR: [{ staffId: value }, { email: { equals: value, mode: 'insensitive' } }] },
      select: { id: true, staffId: true, email: true, firstName: true, lastName: true },
    })
    if (!head) return { ok: false, error: `No active staff member found for head "${value}". Use their staff number or email.` }
    const headName = fullName(head)
    const currentIds = [...new Set(targets.map((d) => d.headId).filter((x): x is string => !!x))]
    const currentHeads = currentIds.length
      ? await db.staffRecord.findMany({ where: { companyId, id: { in: currentIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : []
    for (const d of targets) {
      if (d.headId === head.id) {
        skipped.push({ ref: d.name, reason: `already headed by ${headName}` })
        continue
      }
      const current = currentHeads.find((h) => h.id === d.headId)
      steps.push({ id: d.id, label: d.name, from: current ? fullName(current) : 'No head', to: headName, call: { kind: 'deptHead', id: d.id, headId: head.id, headName } })
      assumptions.push({ table: 'department', id: d.id, field: 'headId', value: d.headId ?? null, label: `${d.name}: head` })
      assumptions.push({ table: 'department', id: d.id, field: 'status', value: 'Active', label: `${d.name}: active department` })
    }
    if (steps.length) {
      assumptions.push({ table: 'staff', id: head.id, field: 'isActive', value: 'true', label: `${headName}: active` })
      title = steps.length === 1 ? `Make ${headName} head of ${steps[0].label}` : `Make ${headName} head of ${steps.length} departments`
    }
  } else {
    const units = await db.businessUnit.findMany({ where: { companyId, status: 'Active' }, select: { id: true, name: true } })
    const unit = units.find((u) => same(u.name, value))
    if (!unit) return { ok: false, error: `No active business unit named "${value}". Active business units: ${units.length ? nameList(units.map((u) => u.name)) : 'none'}.` }
    for (const d of targets) {
      if (same(d.businessUnit, unit.name)) {
        skipped.push({ ref: d.name, reason: `already in ${unit.name}` })
        continue
      }
      steps.push({
        id: d.id,
        label: d.name,
        from: clean(d.businessUnit) || 'No business unit',
        to: unit.name,
        call: { kind: 'deptBU', id: d.id, businessUnitId: unit.id, businessUnit: unit.name },
      })
      assumptions.push({ table: 'department', id: d.id, field: 'businessUnit', value: d.businessUnit ?? null, label: `${d.name}: business unit` })
      assumptions.push({ table: 'department', id: d.id, field: 'status', value: 'Active', label: `${d.name}: active department` })
    }
    if (steps.length) {
      assumptions.push({ table: 'businessUnit', id: unit.id, field: 'status', value: 'Active', label: `${unit.name}: active business unit` })
      title = steps.length === 1 ? `Move ${steps[0].label} to ${unit.name}` : `Move ${steps.length} departments to ${unit.name}`
    }
  }

  if (!steps.length) {
    return { ok: false, error: `Nothing to propose: ${skipped.length ? skipped.map((s) => `${s.ref} (${s.reason})`).join('; ') : 'no eligible departments'}.` }
  }
  const meta = { builder: 'department' as const, field: req.field, value, refs: Object.fromEntries(steps.map((s) => [s.id, s.label])) }
  return { ok: true, plan: buildPlan(steps, assumptions, meta), title, skipped }
}
