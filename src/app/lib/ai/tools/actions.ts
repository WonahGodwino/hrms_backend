// [ai-assistant] Action Center tool — action_center_items (read-only).
import type { ToolDefinition } from './types'
import { redactSensitive } from '../redact'

export const actionCenterItems: ToolDefinition = {
  name: 'action_center_items',
  description: 'List recent Action Center decisions for this company. Shows approved, rejected, and pending items.',
  parameters: {
    type: 'object',
    properties: {
      decision: { type: 'string', description: 'Filter by decision type', enum: ['approve', 'reject', 'modify', 'all'], default: 'all' },
      limit: { type: 'number', description: 'Max items to return (1-200)', default: 50 },
    },
  },
  async execute(args, ctx) {
    const where: Record<string, unknown> = { companyId: ctx.companyId }
    const decision = (args.decision as string) ?? 'all'
    if (decision !== 'all') where.decision = decision

    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200)

    const [items, total] = await Promise.all([
      ctx.prisma.actionItemDecision.findMany({
        where,
        orderBy: { decidedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          itemKey: true,
          decision: true,
          reason: true,
          applied: true,
          title: true,
          decidedByName: true,
          decidedByRole: true,
          decidedAt: true,
        },
      }),
      ctx.prisma.actionItemDecision.count({ where }),
    ])

    // Titles, reasons and names of deciders can name staff, so they are shown only when personal data is visible.
    const showPeople = ctx.visibleCategories.includes('personal')
    const shaped = items.map(({ id: _id, title, reason, decidedByName, ...rest }) => ({
      ...rest,
      ...(showPeople ? { title: title ? redactSensitive(title) : null, reason: reason ? redactSensitive(reason) : null, decidedByName } : {}),
    }))
    return { items: shaped, total, returned: shaped.length }
  },
}
