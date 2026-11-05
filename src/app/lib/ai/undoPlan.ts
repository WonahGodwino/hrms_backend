// [ai-assistant] Drafts the reverse of an approved staff or department proposal, from what the proposal recorded.
//
// An undo is a new proposal, not a deletion: it goes through the Action Center like any other and needs its own approval. Each reverse
// step puts the earlier value back, but only where the record still holds the value the original proposal set; a record someone has
// changed since is left alone and listed as skipped.
import type { PrismaClient } from '@prisma/client'
import { buildPlan, type PlanAssumption, type PlanStep, type ProposalPlan } from './proposals'

export type UndoResult =
  | { ok: false; error: string }
  | { ok: true; plan: ProposalPlan; title: string; type: 'staff_change' | 'department_update'; skipped: { label: string; reason: string }[] }

type Stored = { plan: unknown; type: string; status: string; title: string }

const clean = (v: unknown) => String(v ?? '').trim()
const same = (a: unknown, b: unknown) => clean(a).toLowerCase() === clean(b).toLowerCase()
const nameOf = (s: { firstName: string; lastName: string; email?: string }) => `${s.firstName} ${s.lastName}`.trim() || s.email || 'Staff member'

export async function buildUndoPlan(db: PrismaClient, companyId: string, proposal: Stored): Promise<UndoResult> {
  if (proposal.type !== 'staff_change' && proposal.type !== 'department_update') {
    return { ok: false, error: 'Only staff and department changes can be undone this way. Automation rules can be changed back with a new rule proposal.' }
  }
  if (proposal.status !== 'approved' && proposal.status !== 'partly_applied') {
    return { ok: false, error: `Only an approved proposal can be undone; this one is ${proposal.status}.` }
  }
  const plan = proposal.plan as ProposalPlan
  const before = (step: PlanStep, table: string, field: string) => plan.assumptions.find((a) => a.table === table && a.id === step.id && a.field === field)?.value ?? null

  const steps: PlanStep[] = []
  const assumptions: PlanAssumption[] = []
  const skipped: { label: string; reason: string }[] = []
  const skip = (label: string, reason: string) => skipped.push({ label, reason })

  const staffIds = plan.steps.filter((s) => s.call.kind.startsWith('staff')).map((s) => s.id)
  const deptIds = plan.steps.filter((s) => s.call.kind.startsWith('dept')).map((s) => s.id)
  const [staff, departments, activeDepts, designations, units, people] = await Promise.all([
    staffIds.length ? db.staffRecord.findMany({ where: { companyId, id: { in: staffIds } }, select: { id: true, firstName: true, lastName: true, email: true, department: true, designationId: true, managerId: true, isActive: true } }) : [],
    deptIds.length ? db.department.findMany({ where: { companyId, id: { in: deptIds } }, select: { id: true, name: true, headId: true, businessUnit: true, status: true } }) : [],
    db.department.findMany({ where: { companyId, status: 'Active' }, select: { id: true, name: true } }),
    db.designation.findMany({ where: { companyId, status: 'Active' }, select: { id: true, title: true } }),
    db.businessUnit.findMany({ where: { companyId, status: 'Active' }, select: { id: true, name: true } }),
    db.staffRecord.findMany({ where: { companyId, isActive: true }, select: { id: true, firstName: true, lastName: true, email: true } }),
  ])
  const person = (id: string) => people.find((p) => p.id === id)

  for (const step of plan.steps) {
    const kind = step.call.kind
    const s = staff.find((x) => x.id === step.id)
    const d = departments.find((x) => x.id === step.id)

    if (kind === 'staffDept' || kind === 'staffDesig' || kind === 'staffManager') {
      if (!s) { skip(step.label, 'no longer exists'); continue }
      if (!s.isActive) { skip(step.label, 'no longer active'); continue }
      const label = nameOf(s)
      if (kind === 'staffDept') {
        const old = clean(before(step, 'staff', 'department'))
        if (!same(s.department, step.call.department)) { skip(label, 'department changed since'); continue }
        if (!old) { skip(label, 'had no department before, which cannot be set back from here'); continue }
        const back = activeDepts.find((x) => same(x.name, old))
        if (!back) { skip(label, `the earlier department "${old}" is no longer active`); continue }
        steps.push({ id: s.id, label, from: clean(s.department), to: back.name, call: { kind: 'staffDept', id: s.id, department: back.name } })
        assumptions.push({ table: 'staff', id: s.id, field: 'department', value: s.department ?? null, label: `${label}: department` }, { table: 'staff', id: s.id, field: 'isActive', value: 'true', label: `${label}: active` }, { table: 'department', id: back.id, field: 'status', value: 'Active', label: `${back.name}: active department` })
      } else if (kind === 'staffDesig') {
        const oldId = before(step, 'staff', 'designationId')
        if (s.designationId !== step.call.designationId) { skip(label, 'designation changed since'); continue }
        const back = designations.find((x) => x.id === oldId)
        if (!oldId) { skip(label, 'had no designation before, which cannot be set back from here'); continue }
        if (!back) { skip(label, 'the earlier designation is no longer active'); continue }
        steps.push({ id: s.id, label, from: designations.find((x) => x.id === s.designationId)?.title ?? 'Current designation', to: back.title, call: { kind: 'staffDesig', id: s.id, designationId: back.id } })
        assumptions.push({ table: 'staff', id: s.id, field: 'designationId', value: s.designationId ?? null, label: `${label}: designation` }, { table: 'staff', id: s.id, field: 'isActive', value: 'true', label: `${label}: active` }, { table: 'designation', id: back.id, field: 'status', value: 'Active', label: `${back.title}: active designation` })
      } else {
        const oldId = before(step, 'staff', 'managerId')
        if (s.managerId !== step.call.managerId) { skip(label, 'manager changed since'); continue }
        const back = oldId ? person(oldId) : undefined
        if (!oldId) { skip(label, 'had no manager before, which cannot be set back from here'); continue }
        if (!back) { skip(label, 'the earlier manager is no longer active'); continue }
        steps.push({ id: s.id, label, from: step.to, to: nameOf(back), call: { kind: 'staffManager', id: s.id, managerId: back.id } })
        assumptions.push({ table: 'staff', id: s.id, field: 'managerId', value: s.managerId ?? null, label: `${label}: manager` }, { table: 'staff', id: s.id, field: 'isActive', value: 'true', label: `${label}: active` }, { table: 'staff', id: back.id, field: 'isActive', value: 'true', label: `${nameOf(back)}: active` })
      }
    } else if (kind === 'deptHead' || kind === 'deptBU') {
      if (!d) { skip(step.label, 'no longer exists'); continue }
      if (d.status !== 'Active') { skip(d.name, 'no longer active'); continue }
      if (kind === 'deptHead') {
        const oldId = before(step, 'department', 'headId')
        if (d.headId !== step.call.headId) { skip(d.name, 'head changed since'); continue }
        const back = oldId ? person(oldId) : undefined
        if (!oldId) { skip(d.name, 'had no head before, which cannot be set back from here'); continue }
        if (!back) { skip(d.name, 'the earlier head is no longer active'); continue }
        steps.push({ id: d.id, label: d.name, from: step.to, to: nameOf(back), call: { kind: 'deptHead', id: d.id, headId: back.id, headName: nameOf(back) } })
        assumptions.push({ table: 'department', id: d.id, field: 'headId', value: d.headId ?? null, label: `${d.name}: head` }, { table: 'department', id: d.id, field: 'status', value: 'Active', label: `${d.name}: active department` }, { table: 'staff', id: back.id, field: 'isActive', value: 'true', label: `${nameOf(back)}: active` })
      } else {
        const old = clean(before(step, 'department', 'businessUnit'))
        if (!same(d.businessUnit, step.call.businessUnit)) { skip(d.name, 'business unit changed since'); continue }
        if (!old) { skip(d.name, 'had no business unit before, which cannot be set back from here'); continue }
        const back = units.find((u) => same(u.name, old))
        if (!back) { skip(d.name, `the earlier business unit "${old}" is no longer active`); continue }
        steps.push({ id: d.id, label: d.name, from: clean(d.businessUnit), to: back.name, call: { kind: 'deptBU', id: d.id, businessUnitId: back.id, businessUnit: back.name } })
        assumptions.push({ table: 'department', id: d.id, field: 'businessUnit', value: d.businessUnit ?? null, label: `${d.name}: business unit` }, { table: 'department', id: d.id, field: 'status', value: 'Active', label: `${d.name}: active department` }, { table: 'businessUnit', id: back.id, field: 'status', value: 'Active', label: `${back.name}: active business unit` })
      }
    } else {
      skip(step.label, 'this kind of change cannot be undone from here')
    }
  }

  if (!steps.length) {
    return { ok: false, error: `Nothing can be undone: ${skipped.map((x) => `${x.label} (${x.reason})`).join('; ') || 'no changes found'}.` }
  }
  return {
    ok: true,
    plan: buildPlan(steps, assumptions),
    title: `Undo: ${proposal.title}`.slice(0, 190),
    type: proposal.type,
    skipped,
  }
}
