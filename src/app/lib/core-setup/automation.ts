// src/app/lib/core-setup/automation.ts
//
// Server side of the Automation Center and the Action Center (PRD sections 4 and 5).
//
//   - what an Admin changed on an automation rule (automation_rule_settings)
//   - decisions taken on Action Center items (action_item_decisions)
//   - the checks that ran: scheduled, on a record change, or "Run now" (automation_runs)
//   - an alert for the company's Admins when a check fails (the existing notifications table)
//
// The rule definitions, the checks themselves and the scheduler live in the front end; this file persists what they produce and
// what people decide, and keeps the audit trail in step.
import type { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'
import { legacyOrgEvents, serializeAuditEvent } from '@/app/lib/core-setup/audit'

export const AUTOMATION_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']
export const AUTOMATION_DECIDER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR']
export const RULE_FIELDS = ['status', 'mode', 'scope', 'name', 'description', 'trigger', 'escalation', 'conditions', 'cadence'] as const
export const AUTOMATION_FAILED = 'AUTOMATION_FAILED'

// The company a request acts in: the user's own company, or for a Super Admin / assigned Admin the company chosen in the switcher.
export async function companyForRequest(
  request: NextRequest,
  user: { role: string; userId: string; companyId?: string | null },
): Promise<{ companyId: string } | { error: string; status: number }> {
  const requested = new URL(request.url).searchParams.get('companyId')
  const scoped = await resolveScopedCompanyId(user, requested)
  if (scoped.forbidden) return { error: 'Access denied to this company', status: 403 }
  if (!scoped.companyId) return { error: 'companyId is required', status: 400 }
  return { companyId: scoped.companyId }
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))

// Everything the Automation Center and the Action Center read, in one response.
export async function loadAutomationState(companyId: string) {
  const [rules, decisions, runs, events, legacy] = await Promise.all([
    prisma.automationRuleSetting.findMany({ where: { companyId } }),
    prisma.actionItemDecision.findMany({ where: { companyId } }),
    prisma.automationRun.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 400 }),
    prisma.coreSetupAuditEvent.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    legacyOrgEvents(companyId),
  ])

  const ruleMap: Record<string, unknown> = {}
  for (const r of rules) {
    ruleMap[r.ruleId] = {
      ...((r.overrides as Record<string, unknown>) ?? {}),
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedByName ?? '',
    }
  }

  const decisionMap: Record<string, unknown> = {}
  for (const d of decisions) {
    decisionMap[d.itemKey] = {
      decision: d.decision,
      reason: d.reason ?? '',
      applied: d.applied,
      value: d.value ?? '',
      signature: d.signature ?? '',
      title: d.title ?? d.itemKey,
      ruleId: d.ruleId,
      by: d.decidedByName ?? '',
      role: d.decidedByRole ?? '',
      at: d.decidedAt.toISOString(),
    }
  }

  const audit = [...events.map(serializeAuditEvent), ...legacy]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 1000)

  return {
    rules: ruleMap,
    decisions: decisionMap,
    audit,
    runs: runs.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      trigger: r.trigger,
      detail: r.detail ?? '',
      at: r.createdAt.toISOString(),
      evaluated: r.evaluated,
      exceptions: r.exceptions,
      status: r.status,
      error: r.error ?? '',
      actor: r.actorName ?? '247HR Automation',
    })),
  }
}

export interface FailedCheck {
  ruleId: string
  name: string
  error: string
  trigger: string
}

// A failed check raises one alert for the company's Admins (PRD 4.4). The same rule failing again while the earlier alert is still
// unread and under an hour old is added to that alert instead of sending another, so a rule that fails every few minutes does not
// bury the notification list.
export async function raiseFailedCheckAlerts(companyId: string, failures: FailedCheck[]) {
  if (!failures.length) return
  const admins = await prisma.staffRecord.findMany({
    where: { companyId, role: 'ADMIN', isActive: true },
    select: { id: true },
  })
  if (!admins.length) return

  const hourAgo = new Date(Date.now() - 3600000)
  for (const admin of admins) {
    const recent = await prisma.notification.findMany({
      where: { userId: admin.id, companyId, type: AUTOMATION_FAILED, read: false, createdAt: { gt: hourAgo } },
    })
    const alreadyAlerted = (n: (typeof recent)[number]) =>
      Array.isArray((n.data as { rules?: { ruleId?: string }[] } | null)?.rules)
        ? ((n.data as { rules: { ruleId?: string }[] }).rules).map((x) => x.ruleId)
        : []
    const alerted = new Set(recent.flatMap(alreadyAlerted))
    const fresh = failures.filter((f) => !alerted.has(f.ruleId))
    if (!fresh.length) continue

    const first = fresh[0]
    const title = fresh.length === 1 ? `Automation check failed: ${first.name}` : `${fresh.length} automation checks failed`
    const message =
      fresh.length === 1
        ? `${first.name} could not finish its ${first.trigger === 'event' ? 'record-change' : 'scheduled'} check. ${first.error}`
        : `${fresh
            .slice(0, 3)
            .map((f) => f.name)
            .join(', ')}${fresh.length > 3 ? ` and ${fresh.length - 3} more` : ''} could not finish. No records were changed.`

    await prisma.notification.create({
      data: {
        userId: admin.id,
        companyId,
        type: AUTOMATION_FAILED,
        title,
        message,
        data: { rules: fresh.map((f) => ({ ruleId: f.ruleId, name: f.name, error: f.error })), at: new Date().toISOString() },
      },
    })
  }
}

export const cleanRuleOverrides = (body: Record<string, unknown>) =>
  Object.fromEntries(RULE_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]))

export const asText = str
