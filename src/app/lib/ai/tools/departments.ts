// [ai-assistant] Department tool — list_departments (read-only).
import type { ToolDefinition } from './types'

export const listDepartments: ToolDefinition = {
  name: 'list_departments',
  description: 'List all departments for this company, including business unit and staff count. The head of department is named only when the company lets the assistant see personal data.',
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

    const departments = await ctx.prisma.department.findMany({
      where,
      select: {
        name: true,
        code: true,
        status: true,
        activeHeadcount: true,
        businessUnit: true,
        businessUnitRef: { select: { name: true } },
        head: { select: { firstName: true, lastName: true } },
        assistantHead: { select: { firstName: true, lastName: true } },
      },
      orderBy: { name: 'asc' },
      take: 200,
    })

    // Heads are people: they are named only when personal data is visible. Otherwise the model learns only whether a head is set.
    const showPeople = ctx.visibleCategories.includes('personal')
    const nameOf = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : null)
    const result = departments.map(({ head, assistantHead, businessUnitRef, ...rest }) => ({
      ...rest,
      businessUnitName: businessUnitRef?.name ?? null,
      hasHead: !!head,
      hasAssistantHead: !!assistantHead,
      ...(showPeople ? { head: nameOf(head), assistantHead: nameOf(assistantHead) } : {}),
    }))
    return { departments: result, total: result.length }
  },
}
