// [ai-assistant] Builds and validates the plan for a staff change proposal (department, designation or reporting manager).
//
// Everything the plan contains is read from the company's own records. The model only supplies references (staff numbers or
// emails, a department name, a designation title), never ids or display text, so what an approver sees is what will be applied.
import type { PrismaClient } from '@prisma/client'
import { MAX_STEPS, buildPlan, type PlanAssumption, type PlanStep, type ProposalPlan } from './proposals'

export type StaffChangeField = 'department' | 'designation' | 'manager'
export const STAFF_CHANGE_FIELDS: StaffChangeField[] = ['department', 'designation', 'manager']

export interface StaffChangeRequest {
  staff: string[]
  field: StaffChangeField
  value: string
}

export interface Skipped {
  ref: string
  reason: string
}

export type StaffPlanResult =
  | { ok: false; error: string }
  | {
      ok: true
      plan: ProposalPlan
      title: string
      // Staff number per step, so the model can be told what was proposed without personal names when that category is hidden.
      refs: string[]
      skipped: Skipped[]
    }

const MAX_MANAGER_CHAIN = 25
const fullName = (s: { firstName: string; lastName: string; email?: string }) => `${s.firstName} ${s.lastName}`.trim() || s.email || 'Staff member'
const clean = (v: unknown) => String(v ?? '').trim()

function nameList(names: string[]): string {
  const shownNames = names.slice(0, 20)
  return shownNames.join(', ') + (names.length > shownNames.length ? ` and ${names.length - shownNames.length} more` : '')
}

export async function buildStaffChangePlan(db: PrismaClient, companyId: string, req: StaffChangeRequest): Promise<StaffPlanResult> {
  const refs = [...new Set((req.staff ?? []).map(clean).filter(Boolean))]
  const value = clean(req.value)
  if (!STAFF_CHANGE_FIELDS.includes(req.field)) return { ok: false, error: 'field must be department, designation or manager.' }
  if (!refs.length) return { ok: false, error: 'Provide at least one staff number or email in "staff".' }
  if (refs.length > MAX_STEPS) return { ok: false, error: `A proposal can cover at most ${MAX_STEPS} staff. Split it into several proposals.` }
  if (!value) return { ok: false, error: 'Provide the new value.' }

  // Resolve staff by company staff number or email (the model never sees internal record ids).
  const found = await db.staffRecord.findMany({
    where: {
      companyId,
      OR: [{ staffId: { in: refs } }, { email: { in: refs, mode: 'insensitive' } }],
    },
    select: { id: true, staffId: true, email: true, firstName: true, lastName: true, department: true, position: true, designationId: true, managerId: true, isActive: true },
  })
  const matches = (ref: string) => found.filter((s) => s.staffId === ref || s.email.toLowerCase() === ref.toLowerCase())
  const unknown = refs.filter((r) => matches(r).length === 0)
  if (unknown.length) return { ok: false, error: `No staff found for: ${nameList(unknown)}. Use staff numbers or emails from list_staff.` }
  const ambiguous = refs.filter((r) => matches(r).length > 1)
  if (ambiguous.length) return { ok: false, error: `More than one staff record matches: ${nameList(ambiguous)}. Use the email instead.` }

  const targets = refs.map((r) => ({ ref: r, staff: matches(r)[0] }))
  const skipped: Skipped[] = []
  const eligible = targets.filter((t) => {
    if (t.staff.isActive) return true
    skipped.push({ ref: t.staff.staffId, reason: 'inactive staff are not changed' })
    return false
  })

  const steps: PlanStep[] = []
  const assumptions: PlanAssumption[] = []
  const stepRefs: string[] = []
  let title = ''

  if (req.field === 'department') {
    const departments = await db.department.findMany({ where: { companyId, status: 'Active' }, select: { id: true, name: true } })
    const dept = departments.find((d) => d.name.trim().toLowerCase() === value.toLowerCase())
    if (!dept) return { ok: false, error: `No active department named "${value}". Active departments: ${nameList(departments.map((d) => d.name))}.` }
    for (const { staff } of eligible) {
      if (clean(staff.department).toLowerCase() === dept.name.trim().toLowerCase()) {
        skipped.push({ ref: staff.staffId, reason: `already in ${dept.name}` })
        continue
      }
      const label = fullName(staff)
      steps.push({ id: staff.id, label, from: clean(staff.department) || 'No department', to: dept.name, call: { kind: 'staffDept', id: staff.id, department: dept.name } })
      assumptions.push({ table: 'staff', id: staff.id, field: 'department', value: staff.department ?? null, label: `${label}: department` })
      assumptions.push({ table: 'staff', id: staff.id, field: 'isActive', value: 'true', label: `${label}: active` })
      stepRefs.push(staff.staffId)
    }
    if (steps.length) {
      assumptions.push({ table: 'department', id: dept.id, field: 'status', value: 'Active', label: `${dept.name}: active department` })
      title = steps.length === 1 ? `Move ${steps[0].label} to ${dept.name}` : `Move ${steps.length} staff to ${dept.name}`
    }
  } else if (req.field === 'designation') {
    const designations = await db.designation.findMany({ where: { companyId, status: 'Active' }, select: { id: true, title: true } })
    const desig = designations.find((d) => d.id === value || d.title.trim().toLowerCase() === value.toLowerCase())
    if (!desig) return { ok: false, error: `No active designation "${value}". Active designations: ${nameList(designations.map((d) => d.title))}.` }
    for (const { staff } of eligible) {
      if (staff.designationId === desig.id) {
        skipped.push({ ref: staff.staffId, reason: `already ${desig.title}` })
        continue
      }
      const label = fullName(staff)
      steps.push({ id: staff.id, label, from: clean(staff.position) || 'No designation', to: desig.title, call: { kind: 'staffDesig', id: staff.id, designationId: desig.id } })
      assumptions.push({ table: 'staff', id: staff.id, field: 'designationId', value: staff.designationId ?? null, label: `${label}: designation` })
      assumptions.push({ table: 'staff', id: staff.id, field: 'isActive', value: 'true', label: `${label}: active` })
      stepRefs.push(staff.staffId)
    }
    if (steps.length) {
      assumptions.push({ table: 'designation', id: desig.id, field: 'status', value: 'Active', label: `${desig.title}: active designation` })
      title = steps.length === 1 ? `Change ${steps[0].label}'s designation to ${desig.title}` : `Change the designation of ${steps.length} staff to ${desig.title}`
    }
  } else {
    const manager = await db.staffRecord.findFirst({
      where: { companyId, isActive: true, OR: [{ staffId: value }, { email: { equals: value, mode: 'insensitive' } }] },
      select: { id: true, staffId: true, email: true, firstName: true, lastName: true, managerId: true },
    })
    if (!manager) return { ok: false, error: `No active staff member found for manager "${value}". Use their staff number or email.` }

    // A reporting line must not loop back on itself: walk up from the proposed manager and make sure no target is above them.
    const above = new Set<string>()
    let cursor: string | null = manager.id
    for (let i = 0; cursor && i < MAX_MANAGER_CHAIN; i++) {
      above.add(cursor)
      const next: { managerId: string | null } | null = await db.staffRecord.findFirst({ where: { id: cursor, companyId }, select: { managerId: true } })
      cursor = next?.managerId ?? null
    }

    const managerName = fullName(manager)
    const currentIds = [...new Set(eligible.map((t) => t.staff.managerId).filter((x): x is string => !!x))]
    const currentManagers = currentIds.length
      ? await db.staffRecord.findMany({ where: { companyId, id: { in: currentIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : []
    for (const { staff } of eligible) {
      if (staff.id === manager.id) {
        skipped.push({ ref: staff.staffId, reason: 'a person cannot be their own manager' })
        continue
      }
      if (above.has(staff.id)) {
        skipped.push({ ref: staff.staffId, reason: 'the proposed manager already reports up to them, which would create a loop' })
        continue
      }
      if (staff.managerId === manager.id) {
        skipped.push({ ref: staff.staffId, reason: 'already reports to the proposed manager' })
        continue
      }
      const label = fullName(staff)
      const current = currentManagers.find((m) => m.id === staff.managerId)
      steps.push({ id: staff.id, label, from: current ? fullName(current) : 'No manager', to: managerName, call: { kind: 'staffManager', id: staff.id, managerId: manager.id } })
      assumptions.push({ table: 'staff', id: staff.id, field: 'managerId', value: staff.managerId ?? null, label: `${label}: manager` })
      assumptions.push({ table: 'staff', id: staff.id, field: 'isActive', value: 'true', label: `${label}: active` })
      stepRefs.push(staff.staffId)
    }
    if (steps.length) {
      assumptions.push({ table: 'staff', id: manager.id, field: 'isActive', value: 'true', label: `${managerName}: active` })
      title = steps.length === 1 ? `Set ${managerName} as ${steps[0].label}'s manager` : `Set ${managerName} as manager of ${steps.length} staff`
    }
  }

  if (!steps.length) {
    return { ok: false, error: `Nothing to propose: ${skipped.length ? skipped.map((s) => `${s.ref} (${s.reason})`).join('; ') : 'no eligible staff'}.` }
  }

  const meta = { builder: 'staff' as const, field: req.field, value, refs: Object.fromEntries(steps.map((s, i) => [s.id, stepRefs[i]])) }
  return { ok: true, plan: buildPlan(steps, assumptions, meta), title, refs: stepRefs, skipped }
}
