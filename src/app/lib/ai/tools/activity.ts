// [ai-assistant] Activity tool — activity_log (read-only, gated on employment).
// Reads the Core Setup audit trail: what changed, by whom, when. The per-field before/after values and related-record lists are not
// returned (they can hold values from hidden categories). The action text, free-text summary, object and the actor's name (all of which can name people) are returned only when the
// company lets the assistant see personal data, and the summary is passed through the sensitive-value filter either way.
import type { ToolDefinition } from './types'
import { redactSensitive } from '../redact'

const DAY_MS = 86_400_000
const KINDS = ['record', 'bulk', 'rule', 'decision', 'setting', 'proposal'] as const

export const activityLog: ToolDefinition = {
  name: 'activity_log',
  description:
    'List recent changes recorded in the Core Setup audit trail: what changed, who did it, when, and whether it came from the Action Center, an automation or the AI assistant. Defaults to the last 30 days, newest first, at most 100 entries.',
  category: 'employment',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'How many days back to look (1-180)', default: 30 },
      kind: { type: 'string', description: 'Type of event', enum: [...KINDS] },
      area: { type: 'string', description: 'Area of Core Setup, for example org, staff, ai' },
      limit: { type: 'number', description: 'Max entries (1-100)', default: 50 },
    },
  },
  async execute(args, ctx) {
    const days = Math.min(Math.max(Math.floor(Number(args.days) || 30), 1), 180)
    const limit = Math.min(Math.max(Math.floor(Number(args.limit) || 50), 1), 100)
    const where: Record<string, unknown> = { companyId: ctx.companyId, createdAt: { gte: new Date(Date.now() - days * DAY_MS) } }
    if (args.kind && (KINDS as readonly string[]).includes(String(args.kind))) where.kind = String(args.kind)
    if (args.area) where.area = String(args.area).slice(0, 40)

    const showPeople = ctx.visibleCategories.includes('personal')
    const events = await ctx.prisma.coreSetupAuditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, kind: true, area: true, via: true, action: true, changeType: true, source: true, object: true, summary: true, actorName: true, actorRole: true, createdAt: true },
    })

    return {
      days,
      returned: events.length,
      events: events.map((e) => ({
        when: e.createdAt,
        kind: e.kind,
        area: e.area,
        changeType: e.changeType,
        source: e.source,
        via: e.via || 'by hand',
        actorRole: e.actorRole,
        ...(showPeople ? { action: e.action ? redactSensitive(e.action) : null, actor: e.actorName, object: e.object ? redactSensitive(e.object) : null, summary: e.summary ? redactSensitive(e.summary) : null } : {}),
      })),
    }
  },
}
