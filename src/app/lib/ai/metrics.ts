// [ai-assistant] Success metrics (PRD: Success metrics): the numbers the 247HR team reviews 90 days after release.
// Counts only; no message content is read. Targets are the PRD's and are revisited with real data.
import type { PrismaClient } from '@prisma/client'

export const TARGETS = {
  connected: 0.3, // companies that connect an AI account (of all companies; the plan is not known here)
  weeklyActive: 0.4, // eligible users in connected companies who used it this week
  helpful: 0.75, // ratings of 4 or 5, of those rated
  approved: 0.6, // proposals approved, of those decided
  reversed: 0.05, // approved changes reversed within 7 days (at most)
} as const

type Db = Pick<PrismaClient, 'company' | 'aiAssistantSettings' | 'staffRecord' | 'aIUsageLog' | 'aiMessage' | 'aiProposal'>
const ratio = (n: number, d: number) => (d > 0 ? Number((n / d).toFixed(4)) : null)
const WEEK = 7 * 86_400_000

export async function successMetrics(db: Db, days = 90, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000)
  const [companies, connected, eligible, usage, rated, proposals] = await Promise.all([
    db.company.count(),
    db.aiAssistantSettings.findMany({ where: { enabled: true, keyStatus: 'ok' }, select: { companyId: true } }),
    db.staffRecord.findMany({ where: { isActive: true, role: { in: ['SUPER_ADMIN', 'ADMIN', 'HR'] } }, select: { id: true, companyId: true } }),
    db.aIUsageLog.findMany({ where: { service: 'assistant', createdAt: { gte: new Date(now.getTime() - WEEK) } }, select: { companyId: true, metadata: true }, take: 50_000 }),
    db.aiMessage.findMany({ where: { role: 'assistant', rating: { not: null }, createdAt: { gte: since } }, select: { rating: true }, take: 50_000 }),
    db.aiProposal.findMany({ where: { createdAt: { gte: since } }, select: { status: true, title: true, decidedAt: true, createdAt: true }, take: 50_000 }),
  ])

  const connectedIds = new Set(connected.map((c) => c.companyId))
  const eligibleUsers = eligible.filter((p) => connectedIds.has(p.companyId))
  const activeUsers = new Set(usage.filter((u) => connectedIds.has(u.companyId) && (u.metadata as { status?: string } | null)?.status !== 'refused').map((u) => (u.metadata as { userId?: string } | null)?.userId).filter(Boolean))

  const helpful = rated.filter((m) => (m.rating ?? 0) >= 4).length
  const decided = proposals.filter((p) => ['approved', 'partly_applied', 'rejected'].includes(p.status))
  const approved = decided.filter((p) => p.status !== 'rejected')

  // An undo is a proposal titled "Undo: <the original title>". It counts as a reversal when it was approved within 7 days of that original.
  const originals = approved.filter((p) => !p.title.startsWith('Undo: '))
  const reversed = originals.filter((o) =>
    approved.some((u) => u.title === `Undo: ${o.title}` && o.decidedAt && u.decidedAt && u.decidedAt.getTime() - o.decidedAt.getTime() <= WEEK && u.decidedAt >= o.decidedAt),
  ).length

  const value = {
    companiesConnected: { value: ratio(connected.length, companies), count: connected.length, of: companies, target: TARGETS.connected, note: 'Of all companies; the paid-plan filter needs billing data this module does not have.' },
    weeklyActiveUsers: { value: ratio(activeUsers.size, eligibleUsers.length), count: activeUsers.size, of: eligibleUsers.length, target: TARGETS.weeklyActive },
    answersHelpful: { value: ratio(helpful, rated.length), count: helpful, of: rated.length, target: TARGETS.helpful },
    proposalsApproved: { value: ratio(approved.length, decided.length), count: approved.length, of: decided.length, target: TARGETS.approved },
    changesReversedWithin7Days: { value: ratio(reversed, originals.length), count: reversed, of: originals.length, targetMax: TARGETS.reversed },
    hiddenValuesInPrompts: { value: 0, note: 'Enforced by tests/ai/noHiddenValues.test.ts (every tool, every category) and the stored-text filter; sample the audit trail during the pilot.' },
    supportTickets: { value: null, note: 'Counted in the support tool, not here.' },
  }
  return { days, ...value }
}