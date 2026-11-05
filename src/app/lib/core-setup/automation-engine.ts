// src/app/lib/core-setup/automation-engine.ts
//
// The server-side scheduler for the Automation Center (PRD 4.4).
//
// The same checks the browser runs (front end: features/intelligence/liveActionItems.js and departments/detectors.js), run here over
// the company's records on each cron tick, so scheduled and record-change checks no longer depend on someone having the app open.
// A run is recorded exactly like a browser run (automation_runs), so the Automation Center, Execution History and the failed-check
// alert work the same way. Nothing is ever changed by a check: a check only counts what needs a person's decision, and the Action
// Center queue is built from live data when someone opens it.
//
// Not run here (still run by the browser, which reports them with POST /automation/runs): ar-004 missing compensation mappings,
// ar-005 payroll template readiness and ar-008 template conflicts. They need the template analysis in
// frontend/src/pages/core-setup/template/templateAnalysis.js, which has not been ported.
import { prisma } from '@/app/lib/db'
import { raiseFailedCheckAlerts, type FailedCheck } from '@/app/lib/core-setup/automation'

export const CADENCE_MINUTES: Record<string, number> = { event: 0, hourly: 60, daily: 1440, weekly: 10080 }

// Same defaults as the front end (liveActionItems.js DEFAULT_CADENCE). An Admin can change a rule's cadence; that override is read below.
export const DEFAULT_CADENCE: Record<string, string> = {
  'ar-001': 'daily', 'ar-002': 'daily', 'ar-003': 'daily', 'ar-009': 'weekly',
  'ar-010': 'daily', 'ar-014': 'weekly',
  'ar-007': 'event', 'ar-011': 'event', 'ar-013': 'event',
}

export const RULE_NAMES: Record<string, string> = {
  'ar-001': 'Suggest organization assignment for newly registered staff',
  'ar-002': 'Detect likely duplicate staff records',
  'ar-003': 'Detect duplicate department structures',
  'ar-007': 'Prepare impact analysis when a department changes',
  'ar-009': 'Detect inactive organizational structures',
  'ar-010': 'Detect missing staff data for payroll generation',
  'ar-011': 'Re-onboarding checks for inactive staff',
  'ar-013': 'Downstream dependency monitoring',
  'ar-014': 'Business unit relationship validation',
}

// The kinds of record whose change makes an event-driven rule run (front end: RULE_RESOURCES), as the audit feed names them.
const RESOURCE_TYPES: Record<string, string[] | '*'> = {
  'ar-001': ['staff'], 'ar-002': ['staff'], 'ar-003': ['department'], 'ar-009': ['department', 'staff'],
  'ar-010': ['staff', 'designation'], 'ar-014': ['department', 'business_unit'],
  'ar-007': ['department', 'business_unit'], 'ar-011': ['staff'], 'ar-013': '*',
}

export interface RuleResult { evaluated: number; exceptions: number }

const norm = (s: unknown) => String(s ?? '').toLowerCase().trim()
const isActive = (status: unknown) => norm(status || 'active') === 'active'
const fullName = (s: { firstName?: string | null; lastName?: string | null }) => `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim()

// ---- duplicate department detection (same rule as departments/detectors.js detectDuplicate)
const STOP = new Set(['department', 'dept', 'and', 'the', 'of', 'team', 'unit', 'division'])
const tokens = (s: string) =>
  String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t && !STOP.has(t))
const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a)
  const B = new Set(b)
  const inter = [...A].filter((x) => B.has(x)).length
  return A.size + B.size - inter === 0 ? 0 : inter / (A.size + B.size - inter)
}
export function hasDuplicateDepartments(names: string[]): boolean {
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const ta = tokens(names[i])
      const tb = tokens(names[j])
      const contains = ta.length > 0 && tb.length > 0 && (ta.every((t) => tb.includes(t)) || tb.every((t) => ta.includes(t)))
      if (jaccard(ta, tb) >= 0.6 || contains) return true
    }
  }
  return false
}

// ---- the scanning checks
async function scanChecks(companyId: string, ids: string[]): Promise<Record<string, RuleResult>> {
  const want = new Set(ids)
  const out: Record<string, RuleResult> = {}
  const needStaff = ['ar-001', 'ar-002', 'ar-010'].some((id) => want.has(id))
  const needDepts = ['ar-003', 'ar-009', 'ar-014'].some((id) => want.has(id))

  const staff = needStaff
    ? await prisma.staffRecord.findMany({
        where: { companyId, isActive: true },
        select: { firstName: true, lastName: true, department: true, departmentId: true, designationId: true },
      })
    : []
  const departments = needDepts
    ? await prisma.department.findMany({
        where: { companyId },
        select: { name: true, status: true, headId: true, businessUnit: true, businessUnitId: true },
      })
    : []

  if (want.has('ar-001')) {
    out['ar-001'] = { evaluated: staff.length, exceptions: staff.filter((s) => !s.department && !s.departmentId).length }
  }
  if (want.has('ar-010')) {
    out['ar-010'] = { evaluated: staff.length, exceptions: staff.filter((s) => !s.designationId).length }
  }
  if (want.has('ar-002')) {
    const groups = new Map<string, number>()
    for (const s of staff) {
      const k = norm(fullName(s)).replace(/\s+/g, ' ')
      if (k) groups.set(k, (groups.get(k) ?? 0) + 1)
    }
    const people = [...groups.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0)
    out['ar-002'] = { evaluated: staff.length, exceptions: people }
  }
  if (want.has('ar-003')) {
    const active = departments.filter((d) => isActive(d.status)).map((d) => d.name)
    out['ar-003'] = { evaluated: departments.length, exceptions: hasDuplicateDepartments(active) ? 2 : 0 }
  }
  if (want.has('ar-009')) {
    out['ar-009'] = { evaluated: departments.length, exceptions: departments.filter((d) => isActive(d.status) && !d.headId).length }
  }
  if (want.has('ar-014')) {
    const activeBUs = await prisma.businessUnit.count({ where: { companyId, archived: 0, status: { equals: 'Active', mode: 'insensitive' } } })
    const noBu = activeBUs
      ? departments.filter((d) => isActive(d.status) && !d.businessUnitId && (!d.businessUnit || norm(d.businessUnit) === 'unassigned')).length
      : 0
    if (activeBUs || departments.length) out['ar-014'] = { evaluated: departments.length, exceptions: noBu }
  }
  return out
}

// ---- the change-driven checks: what changed since the rule last ran, read from the audit feed
async function eventChecks(companyId: string, since: Record<string, number>, ids: string[]): Promise<Record<string, RuleResult>> {
  const out: Record<string, RuleResult> = {}
  const earliest = new Date(Math.min(...ids.map((id) => since[id] ?? 0)))
  const events = await prisma.coreSetupAuditEvent.findMany({
    where: { companyId, kind: { in: ['record', 'bulk'] }, createdAt: { gt: earliest } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  const fresh = (id: string) => events.filter((e) => e.createdAt.getTime() > (since[id] ?? 0))
  const related = (e: (typeof events)[number]) => (Array.isArray(e.relatedRecords) ? (e.relatedRecords as { type?: string; identifier?: string }[]) : [])

  if (ids.includes('ar-013')) {
    const w = fresh('ar-013')
    if (w.length) out['ar-013'] = { evaluated: w.length, exceptions: 0 }
  }
  if (ids.includes('ar-007')) {
    const deptEvs = fresh('ar-007').filter((e) => e.area === 'org' && related(e).some((r) => r.type === 'department'))
    if (deptEvs.length) {
      const deptIds = [...new Set(deptEvs.flatMap((e) => related(e).filter((r) => r.type === 'department').map((r) => r.identifier || '')).filter(Boolean))]
      const depts = await prisma.department.findMany({ where: { companyId, id: { in: deptIds } }, select: { headId: true, businessUnitId: true } })
      const bad = depts.filter((d) => !d.headId || !d.businessUnitId).length
      out['ar-007'] = { evaluated: Math.max(deptIds.length, 1), exceptions: bad }
    }
  }
  if (ids.includes('ar-011')) {
    const re = fresh('ar-011').filter((e) => e.area === 'staff' && /reactivated/i.test(e.action))
    if (re.length) {
      const staffIds = re.flatMap((e) => related(e).filter((r) => r.type === 'staff').map((r) => r.identifier || '')).filter(Boolean)
      const people = await prisma.staffRecord.findMany({ where: { companyId, id: { in: staffIds } }, select: { department: true, departmentId: true, designationId: true } })
      const bad = people.filter((s) => (!s.department && !s.departmentId) || !s.designationId).length
      out['ar-011'] = { evaluated: re.length, exceptions: bad }
    }
  }
  return out
}

export interface RunOptions {
  force?: boolean // ignore the schedule and run every enabled rule now
  now?: number
}

export interface CompanyRunSummary {
  companyId: string
  ran: string[]
  failed: string[]
  skipped: number
}

// Runs whatever is due for one company and records each check. Safe to call as often as you like (every few minutes): a rule only
// runs when its cadence says it is due, or, for a rule that reacts to changes, when a record it watches changed since it last ran.
export async function runAutomationForCompany(companyId: string, opts: RunOptions = {}): Promise<CompanyRunSummary> {
  const now = opts.now ?? Date.now()
  const [settings, recent] = await Promise.all([
    prisma.automationRuleSetting.findMany({ where: { companyId } }),
    prisma.automationRun.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 400 }),
  ])
  const override = new Map(settings.map((s) => [s.ruleId, (s.overrides as Record<string, unknown>) ?? {}]))
  const lastRun = new Map<string, (typeof recent)[number]>()
  for (const r of recent) if (!lastRun.has(r.ruleId)) lastRun.set(r.ruleId, r)

  const scanDue: string[] = []
  const eventDue: string[] = []
  const since: Record<string, number> = {}
  let skipped = 0

  for (const id of Object.keys(RULE_NAMES)) {
    const o = override.get(id) ?? {}
    if (o.status === 'disabled') { skipped++; continue }
    const cadence = String(o.cadence || DEFAULT_CADENCE[id] || 'event')
    const mins = CADENCE_MINUTES[cadence] ?? 0
    const last = lastRun.get(id)
    const lastAt = last ? last.createdAt.getTime() : 0
    since[id] = lastAt
    if (last && now - lastAt < 60000 && !opts.force) { skipped++; continue } // two ticks at once must not double-record

    const isEventRule = ['ar-007', 'ar-011', 'ar-013'].includes(id)
    if (isEventRule) { eventDue.push(id); continue }
    if (mins === 0) {
      // A scanning rule set to "event" runs only when a record it watches changed since it last ran (checked below).
      eventDue.push(id)
      continue
    }
    // A failed check is tried again after 15 minutes instead of waiting for its next scheduled time.
    const wait = (last?.status === 'failed' ? Math.min(mins, 15) : mins) * 60000
    if (opts.force || !last || now - lastAt >= wait) scanDue.push(id)
    else skipped++
  }

  const rows: { ruleId: string; trigger: string; detail: string; evaluated: number; exceptions: number; status: string; error: string | null }[] = []
  const failures: FailedCheck[] = []
  const fail = (ids: string[], err: unknown, trigger: string, detail: string) => {
    const message = err instanceof Error ? err.message : 'The check could not finish.'
    for (const id of ids) {
      rows.push({ ruleId: id, trigger, detail, evaluated: 0, exceptions: 0, status: 'failed', error: message.slice(0, 500) })
      failures.push({ ruleId: id, name: RULE_NAMES[id] ?? id, error: message, trigger })
    }
  }

  if (scanDue.length) {
    try {
      const results = await scanChecks(companyId, scanDue)
      for (const id of scanDue) {
        const r = results[id]
        if (r) rows.push({ ruleId: id, trigger: 'schedule', detail: 'scheduled check (server)', evaluated: r.evaluated, exceptions: r.exceptions, status: 'completed', error: null })
      }
    } catch (err) {
      fail(scanDue, err, 'schedule', 'scheduled check (server)')
    }
  }

  // Rules that react to changes: nothing is recorded when nothing changed.
  if (eventDue.length) {
    try {
      const results = await eventChecks(companyId, since, eventDue.filter((id) => ['ar-007', 'ar-011', 'ar-013'].includes(id)))
      for (const [id, r] of Object.entries(results)) rows.push({ ruleId: id, trigger: 'event', detail: 'record change (server)', evaluated: r.evaluated, exceptions: r.exceptions, status: 'completed', error: null })

      // A scanning rule set to "event" re-scans when a record it watches changed.
      const watching = eventDue.filter((id) => !['ar-007', 'ar-011', 'ar-013'].includes(id))
      if (watching.length) {
        const earliest = new Date(Math.min(...watching.map((id) => since[id] ?? 0)))
        const evs = await prisma.coreSetupAuditEvent.findMany({ where: { companyId, kind: { in: ['record', 'bulk'] }, createdAt: { gt: earliest } }, select: { createdAt: true, relatedRecords: true }, take: 500 })
        const changed = watching.filter((id) => {
          const types = RESOURCE_TYPES[id]
          return evs.some((e) => e.createdAt.getTime() > (since[id] ?? 0) && Array.isArray(e.relatedRecords) && (e.relatedRecords as { type?: string }[]).some((r) => types === '*' || (types ?? []).includes(String(r.type))))
        })
        if (changed.length) {
          const scanned = await scanChecks(companyId, changed)
          for (const id of changed) {
            const r = scanned[id]
            if (r) rows.push({ ruleId: id, trigger: 'event', detail: 'record change (server)', evaluated: r.evaluated, exceptions: r.exceptions, status: 'completed', error: null })
          }
        }
      }
    } catch (err) {
      fail(eventDue, err, 'event', 'record change (server)')
    }
  }

  if (rows.length) {
    await prisma.$transaction(
      rows.map((r) => prisma.automationRun.create({ data: { companyId, ruleId: r.ruleId, trigger: r.trigger, detail: r.detail, evaluated: r.evaluated, exceptions: r.exceptions, status: r.status, error: r.error, actorId: null, actorName: '247HR Automation' } })),
    )
  }
  if (failures.length) {
    try {
      await raiseFailedCheckAlerts(companyId, failures)
    } catch (err) {
      console.error('[automation] failed to raise the failed-check alert', err)
    }
  }

  return { companyId, ran: rows.filter((r) => r.status === 'completed').map((r) => r.ruleId), failed: failures.map((f) => f.ruleId), skipped }
}

// Every company that is in use. Archived companies are left alone.
export async function runAutomationForAllCompanies(opts: RunOptions = {}) {
  const companies = await prisma.company.findMany({ where: { archived: 0, status: { equals: 'Active', mode: 'insensitive' } }, select: { id: true } })
  const summaries: CompanyRunSummary[] = []
  for (const c of companies) {
    try {
      summaries.push(await runAutomationForCompany(c.id, opts))
    } catch (err) {
      // One company's failure must not stop the others.
      console.error('[automation] company run failed', c.id, err)
      summaries.push({ companyId: c.id, ran: [], failed: ['*'], skipped: 0 })
    }
  }
  return summaries
}
