// [ai-assistant] Monitoring (WP 20): an alert when the assistant keeps failing, a warning as the monthly cost threshold nears, and the\n// platform view of response times and refusals. No message content is read or stored for any of it.
//
// Both are checked after each assistant request (see the messages route) and only ever create notifications. They never block a
// request, and they repeat at most once per hour (errors) or once per month (usage), so a bad hour does not bury the bell.
import type { PrismaClient } from '@prisma/client'
import { getModelInfo } from './models'

export const ERROR_WINDOW_MS = 15 * 60 * 1000
// PRD: alert the 247HR team when errors pass 5% over 15 minutes. One failure in a quiet window is not an outage, so at least 2 must have failed.
export const ERROR_SAMPLE = 200
export const ERROR_RATE = 0.05
export const ERROR_MIN_FAILED = 2
export const ERROR_REPEAT_MS = 60 * 60 * 1000
export const USAGE_WARNING_RATIO = 0.8
export const ERROR_TYPE = 'AI_ERROR_RATE'
export const USAGE_TYPE = 'AI_USAGE_WARNING'
export const KEY_REJECTED_TYPE = 'AI_KEY_REJECTED'

type Db = Pick<PrismaClient, 'aIUsageLog' | 'notification' | 'staffRecord'>

// Recorded by the messages route when a request fails; successes carry status "ok" (older rows have none, which also counts as ok).
export const isFailed = (metadata: unknown) => (metadata as { status?: string } | null)?.status === 'error'
// Refused requests (wrong role, assistant off, ...) never reached the provider, so they are neither successes nor provider failures.
export const isRefused = (metadata: unknown) => (metadata as { status?: string } | null)?.status === 'refused'

// Super Admins of this company: staff with the role in the company, or a Super Admin assigned to it.
async function superAdminsOf(db: Db, companyId: string): Promise<string[]> {
  const people = await db.staffRecord.findMany({
    where: { isActive: true, role: 'SUPER_ADMIN', OR: [{ companyId }, { userCompanies: { some: { companyId } } }] },
    select: { id: true },
  })
  return people.map((p) => p.id)
}

export async function checkErrorRate(db: Db, companyId: string, now = new Date()) {
  const rows = await db.aIUsageLog.findMany({
    where: { companyId, service: 'assistant', createdAt: { gte: new Date(now.getTime() - ERROR_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' },
    take: ERROR_SAMPLE,
    select: { metadata: true },
  })
  const recent = rows.filter((r) => !isRefused(r.metadata))
  const failed = recent.filter((r) => isFailed(r.metadata)).length
  if (failed < ERROR_MIN_FAILED || failed / recent.length <= ERROR_RATE) return { failed, total: recent.length, notified: 0 }

  let notified = 0
  for (const userId of await superAdminsOf(db, companyId)) {
    const already = await db.notification.findFirst({
      where: { userId, companyId, type: ERROR_TYPE, read: false, createdAt: { gte: new Date(now.getTime() - ERROR_REPEAT_MS) } },
    })
    if (already) continue
    await db.notification.create({
      data: {
        userId, companyId, type: ERROR_TYPE, title: 'The AI Assistant is failing',
        message: `${failed} of ${recent.length} assistant requests (${Math.round((failed / recent.length) * 100)}%) failed in the past 15 minutes. Check the company's API key and the provider's status.`,
        data: { failed, total: recent.length, at: now.toISOString() },
      },
    })
    notified += 1
  }
  return { failed, total: recent.length, notified }
}

// The company's own estimate: logged token counts priced with the model's per-1k rates (the same rates the settings page shows).
export function estimateCost(logs: { model: string; inputLength: number; outputLength: number }[]): number {
  return logs.reduce((sum, l) => {
    const m = getModelInfo(l.model)
    return m ? sum + (l.inputLength / 1000) * m.inputPer1k + (l.outputLength / 1000) * m.outputPer1k : sum
  }, 0)
}

export async function checkUsageWarning(db: Db, companyId: string, threshold: number | null | undefined, now = new Date()) {
  if (!threshold || threshold <= 0) return { estimate: 0, notified: 0 }
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const logs = await db.aIUsageLog.findMany({
    where: { companyId, service: 'assistant', createdAt: { gte: monthStart } },
    select: { model: true, inputLength: true, outputLength: true },
  })
  const estimate = estimateCost(logs)
  if (estimate < threshold * USAGE_WARNING_RATIO) return { estimate, notified: 0 }

  // One warning a month for the company, however many requests cross the line.
  const already = await db.notification.findFirst({ where: { companyId, type: USAGE_TYPE, createdAt: { gte: monthStart } } })
  if (already) return { estimate, notified: 0 }

  const people = await db.staffRecord.findMany({ where: { companyId, isActive: true, role: { in: ['ADMIN', 'HR'] } }, select: { id: true } })
  const percent = Math.round((estimate / threshold) * 100)
  for (const p of people) {
    await db.notification.create({
      data: {
        userId: p.id, companyId, type: USAGE_TYPE, title: 'AI Assistant usage is nearing your limit',
        message: `Estimated AI Assistant cost this month is about $${estimate.toFixed(2)}, ${percent}% of your $${threshold} warning threshold.`,
        data: { estimate: Number(estimate.toFixed(4)), threshold, percent },
      },
    })
  }
  return { estimate, notified: people.length }
}

// The provider answered 401: the company's key was revoked, expired or is wrong. Switch the assistant off for the company, mark the key
// rejected and tell its Admins and HR once. Returns changed = false when the key had already been marked (so nobody is told twice).
export async function handleRejectedKey(db: Pick<PrismaClient, 'aiAssistantSettings' | 'notification' | 'staffRecord'>, companyId: string) {
  const { count } = await db.aiAssistantSettings.updateMany({ where: { companyId, keyStatus: 'ok' }, data: { keyStatus: 'rejected', enabled: false } })
  if (!count) return { changed: false, notified: 0 }
  const people = await db.staffRecord.findMany({ where: { companyId, isActive: true, role: { in: ['ADMIN', 'HR'] } }, select: { id: true } })
  for (const p of people) {
    await db.notification.create({
      data: {
        userId: p.id, companyId, type: KEY_REJECTED_TYPE, title: 'The AI provider rejected your key',
        message: 'Your company\'s AI Assistant has been switched off because the provider rejected its key. Add a new key in Settings > AI Assistant and switch it back on.',
        data: { at: new Date().toISOString() },
      },
    })
  }
  return { changed: true, notified: people.length }
}

// ---- Platform view (Super Admin): response time per provider and refused requests by reason, over the last `days` days ----
const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

export interface MonitoringSummary {
  days: number
  providers: { provider: string; requests: number; failed: number; errorRate: number; medianMs: number | null }[]
  refusals: Record<string, number>
}

export async function monitoringSummary(db: Pick<PrismaClient, 'aIUsageLog'>, days = 7, now = new Date()): Promise<MonitoringSummary> {
  const rows = await db.aIUsageLog.findMany({
    where: { service: 'assistant', createdAt: { gte: new Date(now.getTime() - days * 86_400_000) } },
    select: { model: true, metadata: true },
    take: 50_000,
  })
  const byProvider = new Map<string, { requests: number; failed: number; times: number[] }>()
  const refusals: Record<string, number> = {}
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as { status?: string; reason?: string; provider?: string; durationMs?: number; refusals?: string[] }
    if (meta.status === 'refused') {
      refusals[meta.reason ?? 'other'] = (refusals[meta.reason ?? 'other'] ?? 0) + 1
      continue
    }
    for (const reason of meta.refusals ?? []) refusals[reason] = (refusals[reason] ?? 0) + 1
    const provider = meta.provider ?? getModelInfo(r.model)?.provider ?? 'unknown'
    const entry = byProvider.get(provider) ?? { requests: 0, failed: 0, times: [] }
    entry.requests += 1
    if (meta.status === 'error') entry.failed += 1
    else if (typeof meta.durationMs === 'number') entry.times.push(meta.durationMs)
    byProvider.set(provider, entry)
  }
  return {
    days,
    providers: [...byProvider.entries()].map(([provider, e]) => ({
      provider, requests: e.requests, failed: e.failed, errorRate: e.requests ? Number((e.failed / e.requests).toFixed(4)) : 0, medianMs: median(e.times),
    })),
    refusals,
  }
}