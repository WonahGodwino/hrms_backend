// [ai-assistant] Designation tool — list_designations (read-only).
import type { ToolDefinition } from './types'

export const listDesignations: ToolDefinition = {
  name: 'list_designations',
  description: 'List all designations (job titles/grades) for this company, including staff count and base pay when the compensation category is visible.',
  category: 'compensation',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status', enum: ['Active', 'Inactive', 'all'], default: 'Active' },
    },
  },
  async execute(args, ctx) {
    const where: Record<string, unknown> = { companyId: ctx.companyId }
    const status = (args.status as string) ?? 'Active'
    if (status !== 'all') where.status = status

    const showPay = ctx.visibleCategories.includes('compensation')

    const designations = await ctx.prisma.designation.findMany({
      where,
      select: {
        id: true,
        title: true,
        code: true,
        status: true,
        staffCount: true,
        description: true,
        basePay: showPay,
        basePayFrequency: showPay,
      },
      orderBy: { title: 'asc' },
      take: 200,
    })

    const result = designations.map((d) => ({
      ...d,
      ...(showPay ? {} : { basePay: '[hidden by company policy]', basePayFrequency: '[hidden by company policy]' }),
    }))

    return { designations: result, total: result.length }
  },
}
