// [ai-assistant] Proposals (Phase 2) — storage, expiry and the stale check for changes the assistant proposes.
//
// A proposal never changes company data. It holds a PLAN (the exact calls the Action Center will make through the existing
// record endpoints, built server-side from real records) and the ASSUMPTIONS the plan was built on. Approval re-reads those
// assumptions first; if anything moved, the proposal is marked stale instead of being applied.
import { createHash } from 'crypto'
import type { PrismaClient } from '@prisma/client'
import { MAX_CUSTOM_RULES } from './ruleCatalog'
import { assertTrialWritable, trialErrorBody } from '@/app/lib/trial/guard'

// Narrow on purpose: both the Prisma client and a transaction client satisfy it, so a decision and its audit row can commit together.
export type Db = Pick<PrismaClient, 'aiProposal' | 'staffRecord' | 'department' | 'designation' | 'businessUnit' | 'notification' | 'automationRuleSetting' | 'customAutomationRule'>

export const PROPOSAL_TYPES = ['staff_change', 'department_update', 'rule_setting', 'custom_rule'] as const
export type ProposalType = (typeof PROPOSAL_TYPES)[number]

export const PROPOSAL_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'stale', 'partly_applied'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const PROPOSAL_TTL_DAYS = 14
export const MAX_PENDING_PER_COMPANY = 50
export const MAX_STEPS = 25

// The call kinds the Action Center's executePlan understands (frontend/src/features/intelligence/applyPlans.js).
export type CallKind = 'staffDept' | 'staffDesig' | 'staffManager' | 'deptHead' | 'deptBU' | 'ruleSetting' | 'customRule'

export interface PlanCall {
  kind: CallKind
  id: string
  [field: string]: unknown
}

export interface PlanStep {
  id: string
  label: string
  from: string
  to: string
  call: PlanCall
}

// 'customRule' ids: `name:<lowercase name>` (field exists) and `slots` (field full) for a proposal that creates a custom rule.
export type AssumptionTable = 'staff' | 'department' | 'designation' | 'businessUnit' | 'rule' | 'customRule'

export interface PlanAssumption {
  table: AssumptionTable
  id: string
  field: string
  value: string | null
  label: string
}

// What an approver can change before approving (Modify): the plan is rebuilt from real records with the new value, never edited by hand.
// `refs` maps each step id to the reference the model gave (a staff number, or a department name) so the remaining records can be rebuilt.
export interface PlanMeta {
  builder: 'staff' | 'department'
  field: string
  value: string
  refs: Record<string, string>
}

export interface ProposalPlan {
  version: 1
  fingerprint: string
  steps: PlanStep[]
  assumptions: PlanAssumption[]
  meta?: PlanMeta
}

// A record left out of an approval because it changed after the proposal was made. The rest are applied.
export interface SkippedStep {
  stepId: string
  label: string
  reason: string
  changes: StaleChange[]
}

export interface StaleChange {
  // Which record changed, so a change to one record skips only that record's step (see splitStale).
  table?: AssumptionTable
  recordId?: string
  label: string
  field: string
  expected: string
  actual: string
}

export class ProposalError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function buildPlan(steps: PlanStep[], assumptions: PlanAssumption[], meta?: PlanMeta): ProposalPlan {
  const fingerprint = createHash('sha256')
    .update(steps.map((s) => stable(s.call)).sort().join('|'))
    .digest('hex')
    .slice(0, 24)
  return { version: 1, fingerprint, steps, assumptions, ...(meta ? { meta } : {}) }
}

export interface CreateProposalInput {
  companyId: string
  conversationId?: string | null
  type: ProposalType
  title: string
  description: string
  plan: ProposalPlan
  createdById: string
}

// Pending proposals past their expiry are marked expired. Called before reads and decisions, and by the retention cron.
export async function expireDueProposals(db: Db, companyId?: string, now = new Date()): Promise<number> {
  const result = await db.aiProposal.updateMany({
    where: { status: 'pending', expiresAt: { lt: now }, ...(companyId ? { companyId } : {}) },
    data: { status: 'expired' },
  })
  return result.count
}

export async function createProposal(db: Db, input: CreateProposalInput) {
  if (!PROPOSAL_TYPES.includes(input.type)) throw new ProposalError('INVALID_TYPE', `Unknown proposal type: ${input.type}`)
  // A read-only or expired trial may still read and draft with the assistant, but may not raise a proposal that would change data.
  try {
    await assertTrialWritable(input.companyId)
  } catch (err) {
    const body = trialErrorBody(err)
    if (body) throw new ProposalError(body.code, body.message)
    throw err
  }
  const steps = input.plan.steps
  if (!steps.length) throw new ProposalError('EMPTY_PLAN', 'A proposal needs at least one change.')
  if (steps.length > MAX_STEPS) throw new ProposalError('TOO_MANY_STEPS', `A proposal can hold at most ${MAX_STEPS} changes.`)

  await expireDueProposals(db, input.companyId)

  // The model may retry a tool call: an identical pending proposal is returned instead of creating a second one.
  const existing = await db.aiProposal.findFirst({
    where: {
      companyId: input.companyId,
      type: input.type,
      status: 'pending',
      plan: { path: ['fingerprint'], equals: input.plan.fingerprint },
    },
  })
  if (existing) return { proposal: existing, duplicate: true }

  const pending = await db.aiProposal.count({ where: { companyId: input.companyId, status: 'pending' } })
  if (pending >= MAX_PENDING_PER_COMPANY) {
    throw new ProposalError('TOO_MANY_PENDING', 'There are already too many proposals waiting in the Action Center. Ask an Admin or HR to review them first.')
  }

  const proposal = await db.aiProposal.create({
    data: {
      companyId: input.companyId,
      conversationId: input.conversationId ?? null,
      type: input.type,
      title: input.title.slice(0, 200),
      description: input.description.slice(0, 2000),
      plan: input.plan as unknown as object,
      status: 'pending',
      createdById: input.createdById,
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  })
  return { proposal, duplicate: false }
}

export async function getProposal(db: Db, id: string, companyId: string) {
  await expireDueProposals(db, companyId)
  return db.aiProposal.findFirst({ where: { id, companyId } })
}

export interface ListFilters {
  status?: ProposalStatus | ProposalStatus[] | 'all'
  createdById?: string
  limit?: number
  skip?: number
}

export async function listProposals(db: Db, companyId: string, filters: ListFilters = {}) {
  await expireDueProposals(db, companyId)
  const statuses = Array.isArray(filters.status) ? filters.status : filters.status && filters.status !== 'all' ? [filters.status] : []
  const where = {
    companyId,
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(filters.createdById ? { createdById: filters.createdById } : {}),
  }
  const take = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const skip = Math.max(filters.skip ?? 0, 0)
  const [proposals, total] = await Promise.all([
    db.aiProposal.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
    db.aiProposal.count({ where }),
  ])
  return { proposals, total }
}

export interface StatusChange {
  id: string
  companyId: string
  from: ProposalStatus[]
  to: ProposalStatus
  decidedById?: string
  reason?: string
  // { stale } when a record changed under the plan; { skipped } for records left out of an approval that otherwise went ahead.
  result?: { stale: StaleChange[] } | { skipped: SkippedStep[] }
  // The plan that will be applied, when an approver removed records or changed the value (Modify) or records were skipped as stale.
  // The plan as first proposed is kept once in originalPlan.
  plan?: ProposalPlan
  originalPlan?: ProposalPlan
}

// Moves a proposal only if it is still in one of the expected states, so two people deciding at once cannot both win.
export async function updateProposalStatus(db: Db, change: StatusChange): Promise<boolean> {
  const decided = change.to === 'approved' || change.to === 'rejected'
  const result = await db.aiProposal.updateMany({
    where: { id: change.id, companyId: change.companyId, status: { in: change.from } },
    data: {
      status: change.to,
      ...(change.decidedById ? { decidedById: change.decidedById } : {}),
      ...(decided ? { decidedAt: new Date() } : {}),
      ...(change.reason ? { decisionReason: change.reason.slice(0, 1000) } : {}),
      ...(change.result ? { result: change.result as unknown as object } : {}),
      ...(change.plan ? { plan: change.plan as unknown as object } : {}),
      ...(change.originalPlan ? { originalPlan: change.originalPlan as unknown as object } : {}),
    },
  })
  return result.count === 1
}

// What the approver's browser reports after applying an approved plan. Anything already stored with the approval (the records skipped
// as stale) is kept. Some applied but not all (a failure, or a record skipped) makes the proposal partly applied.
export async function recordProposalResult(db: Db, id: string, companyId: string, result: { applied: number; failed: number }) {
  const row = await db.aiProposal.findFirst({ where: { id, companyId, status: 'approved' }, select: { result: true } })
  if (!row) return
  const before = (row.result as { skipped?: SkippedStep[] } | null) ?? {}
  const skipped = before.skipped?.length ?? 0
  const partly = result.applied > 0 && (result.failed > 0 || skipped > 0)
  await db.aiProposal.updateMany({
    where: { id, companyId, status: 'approved' },
    data: { result: { ...before, ...result } as unknown as object, ...(partly ? { status: 'partly_applied' } : {}) },
  })
}

// A change to the record a step is about skips that step; a change to anything shared (the target department, the new manager) means
// the whole plan is out of date. Rule proposals have one step and no per-record parts, so they are always all-or-nothing.
const RECORD_TABLE: Record<string, AssumptionTable> = { staffDept: 'staff', staffDesig: 'staff', staffManager: 'staff', deptHead: 'department', deptBU: 'department' }

export function splitStale(plan: ProposalPlan, changes: StaleChange[]): { skipped: SkippedStep[]; remaining: PlanStep[]; shared: StaleChange[] } {
  const own = new Map<string, StaleChange[]>()
  const shared: StaleChange[] = []
  for (const c of changes) {
    const step = plan.steps.find((s) => s.id === c.recordId && RECORD_TABLE[s.call.kind] === c.table)
    if (step) own.set(step.id, [...(own.get(step.id) ?? []), c])
    else shared.push(c)
  }
  const skipped = plan.steps
    .filter((s) => own.has(s.id))
    .map((s) => ({ stepId: s.id, label: s.label, reason: 'changed since proposed', changes: own.get(s.id)! }))
  return { skipped, remaining: plan.steps.filter((s) => !own.has(s.id)), shared }
}

// The plan without some of its steps, with a fresh fingerprint. Assumptions about the removed records go with them.
export function planWithout(plan: ProposalPlan, removeStepIds: string[]): ProposalPlan {
  const gone = new Set(removeStepIds)
  const steps = plan.steps.filter((s) => !gone.has(s.id))
  const assumptions = plan.assumptions.filter((a) => !gone.has(a.id))
  const refs = plan.meta ? Object.fromEntries(Object.entries(plan.meta.refs).filter(([id]) => !gone.has(id))) : undefined
  return buildPlan(steps, assumptions, plan.meta && refs ? { ...plan.meta, refs } : undefined)
}
type ProposalRow = NonNullable<Awaited<ReturnType<PrismaClient['aiProposal']['findFirst']>>>

// The shape the Action Center reads. Executable calls are left out: the only copy a browser runs comes from the approve response.
export async function serializeProposals(db: Db, companyId: string, rows: ProposalRow[]) {
  const ids = [...new Set(rows.flatMap((r) => [r.createdById, r.decidedById]).filter((x): x is string => !!x))]
  const people = ids.length
    ? await db.staffRecord.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } })
    : []
  const nameOf = (id: string | null) => {
    if (!id) return null
    const p = people.find((x) => x.id === id)
    return p ? `${p.firstName} ${p.lastName}`.trim() || p.email : 'Former staff member'
  }
  return rows.map((r) => {
    const plan = r.plan as unknown as ProposalPlan
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      description: r.description,
      status: r.status,
      conversationId: r.conversationId,
      createdById: r.createdById,
      createdByName: nameOf(r.createdById),
      decidedById: r.decidedById,
      decidedByName: nameOf(r.decidedById),
      decidedAt: r.decidedAt,
      decisionReason: r.decisionReason,
      result: r.result,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      steps: (plan?.steps ?? []).map((s) => ({ id: s.id, label: s.label, from: s.from, to: s.to, kind: s.call?.kind })),
      // Modify: remove records (any staff or department proposal) or change the value (when the plan can be rebuilt).
      canModify: r.status === 'pending' && (r.type === 'staff_change' || r.type === 'department_update'),
      modify: plan?.meta ? { field: plan.meta.field, value: plan.meta.value } : null,
      modified: !!r.originalPlan,
    }
  })
}

const norm = (v: unknown): string => (v === null || v === undefined || v === '' ? '' : String(v))
const shown = (v: string) => v || 'not set'

// Re-reads every record the plan was built on and lists what is different now. Empty list = still fresh.
export async function checkStale(db: Db, companyId: string, plan: ProposalPlan): Promise<StaleChange[]> {
  const assumptions = plan.assumptions ?? []
  const idsFor = (table: AssumptionTable) => [...new Set(assumptions.filter((a) => a.table === table).map((a) => a.id))]

  const [staff, departments, designations, businessUnits, ruleRows, customRules] = await Promise.all([
    idsFor('staff').length
      ? db.staffRecord.findMany({
          where: { companyId, id: { in: idsFor('staff') } },
          select: { id: true, department: true, designationId: true, managerId: true, isActive: true },
        })
      : [],
    idsFor('department').length
      ? db.department.findMany({ where: { companyId, id: { in: idsFor('department') } }, select: { id: true, status: true, headId: true, businessUnit: true } })
      : [],
    idsFor('designation').length
      ? db.designation.findMany({ where: { companyId, id: { in: idsFor('designation') } }, select: { id: true, status: true } })
      : [],
    idsFor('businessUnit').length
      ? db.businessUnit.findMany({ where: { companyId, id: { in: idsFor('businessUnit') } }, select: { id: true, status: true } })
      : [],
    idsFor('rule').length
      ? db.automationRuleSetting.findMany({ where: { companyId, ruleId: { in: idsFor('rule') } }, select: { ruleId: true, overrides: true } })
      : [],
    idsFor('customRule').length ? db.customAutomationRule.findMany({ where: { companyId }, select: { name: true } }) : [],
  ])

  const customNames = new Set(customRules.map((r) => r.name.trim().toLowerCase()))
  const customState = new Map<string, Record<string, unknown>>(
    idsFor('customRule').map((id) => [id, id === 'slots' ? { full: String(customRules.length >= MAX_CUSTOM_RULES) } : { exists: String(customNames.has(id.replace(/^name:/, ''))) }]),
  )

  // A built-in rule always exists; no saved row just means nobody has changed it yet.
  const ruleState = new Map<string, Record<string, unknown>>(idsFor('rule').map((id) => [id, {}]))
  for (const r of ruleRows) ruleState.set(r.ruleId, (r.overrides as Record<string, unknown> | null) ?? {})

  const rows: Record<AssumptionTable, Map<string, Record<string, unknown>>> = {
    staff: new Map(staff.map((r) => [r.id, r as Record<string, unknown>])),
    department: new Map(departments.map((r) => [r.id, r as Record<string, unknown>])),
    designation: new Map(designations.map((r) => [r.id, r as Record<string, unknown>])),
    businessUnit: new Map(businessUnits.map((r) => [r.id, r as Record<string, unknown>])),
    rule: ruleState,
    customRule: customState,
  }

  const changes: StaleChange[] = []
  for (const a of assumptions) {
    const row = rows[a.table]?.get(a.id)
    if (!row) {
      changes.push({ table: a.table, recordId: a.id, label: a.label, field: a.field, expected: shown(norm(a.value)), actual: 'no longer exists' })
      continue
    }
    const actual = norm(row[a.field])
    if (actual !== norm(a.value)) {
      changes.push({ table: a.table, recordId: a.id, label: a.label, field: a.field, expected: shown(norm(a.value)), actual: shown(actual) })
    }
  }
  return changes
}
