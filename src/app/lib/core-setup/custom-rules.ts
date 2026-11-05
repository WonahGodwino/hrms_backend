// [ai-assistant] Custom automation rules (Phase 3): validation, matching and the scheduled evaluator.
//
// A custom rule is "when staff match ALL of these conditions, do this". The dry-run preview, the Action Center items and the scheduled
// evaluator all call findMatches(), so the number a person sees before saving is the number the evaluator counts.
//
// Like every built-in check, the evaluator never changes a record. `notify` sends a notification. `flag` and `assign_manager` are
// raised in the Action Center (see matchesForActionCenter) so a person approves anything that would change a record.
import type { PrismaClient } from '@prisma/client'
import { buildStaffChangePlan } from '@/app/lib/ai/staffPlan'
import type { ProposalPlan } from '@/app/lib/ai/proposals'
import { MAX_CUSTOM_RULES } from '@/app/lib/ai/ruleCatalog'
import {
  CADENCES,
  CADENCE_MIN_GAP_MS,
  RECORD_TYPES,
  isCadence,
  isRecordType,
  type Cadence,
  type Operator,
  type RecordTypeKey,
  type RuleRow,
} from './custom-rule-types'

export { RECORD_TYPES, CADENCES, describeBuildingBlocks } from './custom-rule-types'
export type { Cadence, Operator, RecordTypeKey, RuleRow } from './custom-rule-types'

export const MAX_RULES_PER_COMPANY = MAX_CUSTOM_RULES
export const MAX_CONDITIONS = 5
export const MAX_MATCHES_SHOWN = 25

export const ACTION_TYPES = ['notify', 'flag', 'assign_manager'] as const
export type ActionType = (typeof ACTION_TYPES)[number]
export const STATUS_VALUES = ['active', 'inactive']

export interface Condition {
  field: string
  operator: Operator
  value: string | number
}
export interface RuleAction {
  type: ActionType
  managerId?: string
}
export interface RuleInput {
  name: string
  description: string
  recordType: RecordTypeKey
  cadence: Cadence
  conditions: Condition[]
  actions: RuleAction[]
}

export type Validation = { ok: true; value: RuleInput } | { ok: false; errors: string[] }

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
const NO_VALUE: Operator[] = ['is_empty', 'is_not_empty']
const WHOLE: Operator[] = ['older_than', 'count_above']

// `visible` is the list of data categories the company lets the AI Assistant see. When given, a condition on a field in any other
// category is refused (a rule cannot test pay if pay is hidden). The builder and the assistant both pass it; internal callers may omit it.
export function validateConditions(input: unknown, recordType: RecordTypeKey = 'staff', visible?: string[]): { conditions: Condition[]; errors: string[] } {
  const def = RECORD_TYPES[recordType]
  const errors: string[] = []
  const rawConditions = Array.isArray(input) ? (input as Record<string, unknown>[]) : []
  if (!rawConditions.length) errors.push(`Add at least one condition, otherwise the rule would match every ${def.label}.`)
  if (rawConditions.length > MAX_CONDITIONS) errors.push(`A rule can have at most ${MAX_CONDITIONS} conditions.`)

  const conditions: Condition[] = []
  rawConditions.slice(0, MAX_CONDITIONS).forEach((c, i) => {
    const n = i + 1
    const field = String(c?.field ?? '')
    const fieldDef = def.fields[field]
    if (!fieldDef) return void errors.push(`Condition ${n}: choose a field for ${def.plural} (${Object.keys(def.fields).join(', ')}).`)
    if (visible && fieldDef.category && !visible.includes(fieldDef.category)) {
      return void errors.push(`Condition ${n}: ${fieldDef.label} is ${fieldDef.category} data, which this company keeps hidden from the AI Assistant, so no rule can test it. An Admin or HR can change that in Settings > AI Assistant.`)
    }
    const operator = String(c?.operator ?? '') as Operator
    if (!fieldDef.operators.includes(operator)) {
      return void errors.push(`Condition ${n}: ${fieldDef.label} supports ${fieldDef.operators.join(' or ')}.`)
    }
    if (NO_VALUE.includes(operator)) return void conditions.push({ field, operator, value: '' })

    if (fieldDef.kind === 'number' || fieldDef.kind === 'count' || fieldDef.kind === 'date') {
      const num = Number(c?.value)
      if (c?.value === '' || c?.value === null || c?.value === undefined || !Number.isFinite(num) || num < 0 || num > 1e12) {
        return void errors.push(`Condition ${n}: ${fieldDef.label} needs a number of 0 or more.`)
      }
      return void conditions.push({ field, operator, value: WHOLE.includes(operator) || field === 'tenure' ? Math.floor(num) : num })
    }
    const text = clean(c?.value, 100)
    if (!text) return void errors.push(`Condition ${n}: enter a value for ${fieldDef.label}.`)
    if (fieldDef.kind === 'status' && !(fieldDef.values ?? STATUS_VALUES).includes(text.toLowerCase())) {
      return void errors.push(`Condition ${n}: ${fieldDef.label} must be ${(fieldDef.values ?? STATUS_VALUES).join(' or ')}.`)
    }
    conditions.push({ field, operator, value: fieldDef.kind === 'status' ? text.toLowerCase() : text })
  })
  return { conditions, errors }
}

// What a person building a rule by hand may test: the categories the company lets the AI Assistant see, plus work profile and organization
// structure ('employment'), which the PRD treats as visible by default. Pay, leave and the like stay refused until the company shows them.
export const builderCategories = (settingsVisible: unknown): string[] => [...new Set([...(Array.isArray(settingsVisible) ? (settingsVisible as string[]) : []), 'employment'])]

export function validateRuleInput(raw: Record<string, unknown>, opts: { visible?: string[] } = {}): Validation {
  const name = clean(raw.name, 100)
  const description = clean(raw.description, 500)
  const errors: string[] = []
  if (raw.recordType !== undefined && !isRecordType(raw.recordType)) errors.push(`Record type must be one of: ${Object.keys(RECORD_TYPES).join(', ')}.`)
  if (raw.cadence !== undefined && !isCadence(raw.cadence)) errors.push(`Schedule must be one of: ${CADENCES.join(', ')}.`)
  const recordType: RecordTypeKey = isRecordType(raw.recordType) ? raw.recordType : 'staff'
  const cadence: Cadence = isCadence(raw.cadence) ? raw.cadence : 'daily'
  // With an unknown record type the conditions cannot be checked against anything, so report that alone.
  if (errors.length) return { ok: false, errors: name ? errors : ['Give the rule a name.', ...errors] }

  const checked = validateConditions(raw.conditions, recordType, opts.visible)
  errors.push(...checked.errors)
  if (!name) errors.unshift('Give the rule a name.')

  const rawActions = Array.isArray(raw.actions) ? (raw.actions as Record<string, unknown>[]) : []
  const actions: RuleAction[] = []
  if (rawActions.length !== 1) errors.push('Choose one action: notify, flag or assign_manager.')
  else {
    const type = String(rawActions[0]?.type ?? '') as ActionType
    if (!ACTION_TYPES.includes(type)) errors.push(`Action must be one of: ${ACTION_TYPES.join(', ')}.`)
    else if (type === 'assign_manager') {
      const managerId = clean(rawActions[0]?.managerId, 100)
      if (recordType !== 'staff') errors.push('Only rules about staff can propose a manager.')
      else if (!managerId) errors.push('Choose who the staff should be assigned to.')
      else actions.push({ type, managerId })
    } else actions.push({ type })
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: { name, description, recordType, cadence, conditions: checked.conditions, actions } }
}

const OP_LABEL: Record<Operator, string> = {
  equals: 'is', not_equals: 'is not', greater_than: 'is more than', less_than: 'is less than',
  is_empty: 'is empty', is_not_empty: 'is not empty', older_than: 'is older than', count_above: 'is above',
}
export const describeCondition = (c: Condition, recordType: RecordTypeKey = 'staff') => {
  const label = RECORD_TYPES[recordType].fields[c.field]?.label ?? c.field
  if (NO_VALUE.includes(c.operator)) return `${label} ${OP_LABEL[c.operator]}`
  return `${label} ${OP_LABEL[c.operator]} ${c.value}${c.operator === 'older_than' ? ' days' : ''}`
}
export const describeConditions = (cs: Condition[], recordType: RecordTypeKey = 'staff') => cs.map((c) => describeCondition(c, recordType)).join(' and ')

export const CADENCE_TEXT: Record<Cadence, string> = { event: 'on every check', hourly: 'every hour', daily: 'every day', weekly: 'every week' }

// ---- matching

const same = (a: unknown, b: unknown) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const empty = (v: unknown) => v === null || v === undefined || String(v).trim() === ''

export function matchesConditions(row: RuleRow, conditions: Condition[], recordType: RecordTypeKey, now: Date): boolean {
  const def = RECORD_TYPES[recordType]
  return conditions.every((c) => {
    const v = row.v[c.field]
    switch (c.operator) {
      case 'equals': return same(v, c.value)
      case 'not_equals': return !same(v, c.value)
      case 'is_empty': return empty(v)
      case 'is_not_empty': return !empty(v)
      case 'greater_than': return typeof v === 'number' && v > Number(c.value)
      case 'less_than': return typeof v === 'number' && v < Number(c.value)
      case 'count_above': return typeof v === 'number' && v > Number(c.value)
      case 'older_than': {
        if (!(v instanceof Date) || def.fields[c.field]?.kind !== 'date') return false
        return Math.floor((now.getTime() - v.getTime()) / 86_400_000) > Number(c.value)
      }
    }
  })
}

type Db = PrismaClient

export async function loadRows(db: Db, companyId: string, recordType: RecordTypeKey = 'staff', now = new Date()): Promise<RuleRow[]> {
  return RECORD_TYPES[recordType].load(db, companyId, now)
}
// Kept for the staff-only callers.
export const loadRuleStaff = (db: Db, companyId: string) => loadRows(db, companyId, 'staff')

// Records that match every condition. Without a status condition only active records are considered, so a rule never fires for people
// or units that left or closed.
export function selectMatches(rows: RuleRow[], conditions: Condition[], now = new Date(), recordType: RecordTypeKey = 'staff') {
  const def = RECORD_TYPES[recordType]
  const pool = def.activeOnly && !conditions.some((c) => c.field === 'status') ? rows.filter((r) => r.active) : rows
  const matched = pool.filter((r) => matchesConditions(r, conditions, recordType, now))
  return { evaluated: pool.length, total: matched.length, staff: matched }
}

export async function findMatches(db: Db, companyId: string, conditions: Condition[], now = new Date(), recordType: RecordTypeKey = 'staff') {
  return selectMatches(await loadRows(db, companyId, recordType, now), conditions, now, recordType)
}

// The sample shown to a person: the record's name, its short reference (staff number, department code, ...) and a second detail.
export const sampleOf = (rows: RuleRow[], n = 5) => rows.slice(0, n).map((r) => ({ staffId: r.ref, name: r.label, department: r.sub }))

type RuleRecord = NonNullable<Awaited<ReturnType<PrismaClient['customAutomationRule']['findFirst']>>>

export function serializeRule(r: RuleRecord, matched?: number) {
  const conditions = r.conditions as unknown as Condition[]
  const recordType = isRecordType(r.recordType) ? r.recordType : 'staff'
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    recordType,
    cadence: isCadence(r.cadence) ? r.cadence : 'daily',
    conditions,
    actions: r.actions as unknown as RuleAction[],
    enabled: r.enabled,
    aiOrigin: r.aiOrigin,
    source: r.source ?? (r.aiOrigin ? 'ai_assistant' : 'manual'),
    proposalId: r.proposalId ?? null,
    createdById: r.createdById,
    createdByName: r.createdByName ?? '',
    approvedById: r.approvedById ?? null,
    approvedByName: r.approvedByName ?? '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    summary: describeConditions(conditions, recordType),
    ...(matched === undefined ? {} : { matched }),
  }
}
// ---- Action Center: what flag and assign_manager rules currently raise

export interface RuleMatches {
  ruleId: string
  name: string
  action: ActionType
  aiOrigin: boolean
  recordType: RecordTypeKey
  // singular and plural names of what matched, for the item's wording ("3 departments")
  recordLabel: string
  recordPlural: string
  total: number
  staff: { staffId: string; name: string; department: string | null }[]
  // assign_manager only: the changes to apply on approval, built and checked here (null when nothing is left to change)
  plan: ProposalPlan | null
  note?: string
}

export async function matchesForActionCenter(db: PrismaClient, companyId: string, now = new Date()): Promise<RuleMatches[]> {
  const rules = await db.customAutomationRule.findMany({ where: { companyId, enabled: true }, orderBy: { createdAt: 'asc' } })
  const out: RuleMatches[] = []
  const cache = new Map<RecordTypeKey, RuleRow[]>()
  for (const rule of rules) {
    const action = (rule.actions as unknown as RuleAction[])[0]
    if (!action || action.type === 'notify') continue
    const recordType: RecordTypeKey = isRecordType(rule.recordType) ? rule.recordType : 'staff'
    if (!cache.has(recordType)) cache.set(recordType, await loadRows(db, companyId, recordType, now))
    const { total, staff: matched } = selectMatches(cache.get(recordType)!, rule.conditions as unknown as Condition[], now, recordType)
    if (!total) continue

    let plan: ProposalPlan | null = null
    let note: string | undefined
    if (action.type === 'assign_manager') {
      const manager = action.managerId ? await db.staffRecord.findFirst({ where: { id: action.managerId, companyId, isActive: true }, select: { staffId: true } }) : null
      if (!manager) note = 'The chosen manager is no longer an active staff member. Edit the rule to choose another.'
      else {
        const built = await buildStaffChangePlan(db, companyId, { staff: matched.slice(0, 25).map((s) => s.ref), field: 'manager', value: manager.staffId })
        if (built.ok) plan = built.plan
        else note = 'Nothing to change right now.'
      }
      if (!plan) continue
    }
    const def = RECORD_TYPES[recordType]
    out.push({ ruleId: rule.id, name: rule.name, action: action.type, aiOrigin: rule.aiOrigin, recordType, recordLabel: def.label, recordPlural: def.plural, total, staff: sampleOf(matched, MAX_MATCHES_SHOWN), plan, ...(note ? { note } : {}) })
  }
  return out
}

// ---- the scheduled evaluator

export const RUN_PREFIX = 'cr-'
export const NOTIFY_TYPE = 'CUSTOM_RULE_MATCH'

export interface EvaluatorResult {
  rules: number
  runs: number
  // rules that were not due yet (hourly, daily and weekly rules wait for their schedule)
  notDue: number
  notified: number
  failed: number
}

// One pass over every enabled rule (or one company's). A rule runs only when it is due: `event` rules on every pass, the others once
// their schedule has elapsed since the rule's last run. Each result is an AutomationRun, so Execution History shows it like any other
// check. A notify rule tells the company's Admins and HR only when its match count changed since the last run.
export async function evaluateCustomRules(db: PrismaClient, opts: { companyId?: string; now?: Date; force?: boolean } = {}): Promise<EvaluatorResult> {
  const now = opts.now ?? new Date()
  const rules = await db.customAutomationRule.findMany({ where: { enabled: true, ...(opts.companyId ? { companyId: opts.companyId } : {}) } })
  const result: EvaluatorResult = { rules: rules.length, runs: 0, notDue: 0, notified: 0, failed: 0 }
  const recipients = new Map<string, string[]>()
  const cache = new Map<string, RuleRow[]>()

  for (const rule of rules) {
    const ruleId = `${RUN_PREFIX}${rule.id}`
    try {
      const action = (rule.actions as unknown as RuleAction[])[0]
      const recordType: RecordTypeKey = isRecordType(rule.recordType) ? rule.recordType : 'staff'
      const cadence: Cadence = isCadence(rule.cadence) ? rule.cadence : 'daily'
      const previous = await db.automationRun.findFirst({ where: { companyId: rule.companyId, ruleId }, orderBy: { createdAt: 'desc' }, select: { exceptions: true, createdAt: true } })
      if (!opts.force && previous && now.getTime() - previous.createdAt.getTime() < CADENCE_MIN_GAP_MS[cadence]) {
        result.notDue += 1
        continue
      }

      const key = `${rule.companyId}:${recordType}`
      if (!cache.has(key)) cache.set(key, await loadRows(db, rule.companyId, recordType, now))
      const { evaluated, total } = selectMatches(cache.get(key)!, rule.conditions as unknown as Condition[], now, recordType)
      const def = RECORD_TYPES[recordType]
      await db.automationRun.create({
        data: { companyId: rule.companyId, ruleId, trigger: 'schedule', detail: `Custom rule "${rule.name}": ${total} of ${evaluated} ${def.plural} match`, evaluated, exceptions: total, status: 'completed', actorName: '247HR Automation' },
      })
      result.runs += 1

      if (action?.type === 'notify' && total > 0 && (!previous || previous.exceptions !== total)) {
        if (!recipients.has(rule.companyId)) {
          const people = await db.staffRecord.findMany({ where: { companyId: rule.companyId, isActive: true, role: { in: ['ADMIN', 'HR'] } }, select: { id: true } })
          recipients.set(rule.companyId, people.map((p) => p.id))
        }
        for (const userId of recipients.get(rule.companyId) ?? []) {
          await db.notification.create({
            data: { userId, companyId: rule.companyId, type: NOTIFY_TYPE, title: `Custom rule: ${rule.name}`, message: `${total} ${def.plural} match "${rule.name}" (${describeConditions(rule.conditions as unknown as Condition[], recordType)}).`, data: { ruleId: rule.id, matched: total } },
          })
          result.notified += 1
        }
      }
    } catch (err) {
      result.failed += 1
      await db.automationRun
        .create({ data: { companyId: rule.companyId, ruleId, trigger: 'schedule', detail: `Custom rule "${rule.name}"`, status: 'failed', error: (err instanceof Error ? err.message : 'The check could not finish.').slice(0, 300), actorName: '247HR Automation' } })
        .catch(() => null)
    }
  }
  return result
}