// [ai-assistant] Staff tools — list_staff and get_staff (read-only).
import type { ToolDefinition } from './types'
import { gateStaffData } from '../gate'

export const listStaff: ToolDefinition = {
  name: 'list_staff',
  usesStaffFields: true,
  description: 'List staff records for this company. Supports filtering by department, designation/position, active status, and name search. Returns at most 200 records plus a total count. Fields are gated by company data-category settings.',
  parameters: {
    type: 'object',
    properties: {
      department: { type: 'string', description: 'Filter by department name (partial match)' },
      position: { type: 'string', description: 'Filter by position/designation (partial match)' },
      status: { type: 'string', description: 'Filter by active status', enum: ['active', 'inactive', 'all'], default: 'active' },
      search: { type: 'string', description: 'Search by first name, last name, or email' },
      limit: { type: 'number', description: 'Max records to return (1-200)', default: 50 },
      skip: { type: 'number', description: 'Number of records to skip for pagination', default: 0 },
    },
  },
  async execute(args, ctx) {
    const where: Record<string, unknown> = { companyId: ctx.companyId }
    const status = (args.status as string) ?? 'active'
    if (status === 'active') where.isActive = true
    else if (status === 'inactive') where.isActive = false

    if (args.department) where.department = { contains: args.department as string, mode: 'insensitive' }
    if (args.position) where.position = { contains: args.position as string, mode: 'insensitive' }
    if (args.search) {
      const s = args.search as string
      where.OR = [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
      ]
    }

    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200)
    const skip = Math.max(Number(args.skip) || 0, 0)

    const [records, total] = await Promise.all([
      ctx.prisma.staffRecord.findMany({ where, take: limit, skip, orderBy: { firstName: 'asc' } }),
      ctx.prisma.staffRecord.count({ where }),
    ])

    const gated = gateStaffData(records as unknown as Record<string, unknown>[], ctx.visibleCategories)
    return { staff: gated, total, returned: gated.length }
  },
}

export const getStaff: ToolDefinition = {
  name: 'get_staff',
  usesStaffFields: true,
  description: 'Get a single staff record by staff number or email. Fields are gated by company data-category settings.',
  parameters: {
    type: 'object',
    properties: {
      staffId: { type: 'string', description: 'The staff number (the staffId shown by list_staff, for example MG-1001)' },
      email: { type: 'string', description: 'The staff email address' },
    },
  },
  async execute(args, ctx) {
    let record
    if (args.staffId) {
      const ref = args.staffId as string
      record = await ctx.prisma.staffRecord.findFirst({
        where: { companyId: ctx.companyId, OR: [{ staffId: ref }, { id: ref }] },
      })
    } else if (args.email) {
      record = await ctx.prisma.staffRecord.findFirst({
        where: { email: args.email as string, companyId: ctx.companyId },
      })
    } else {
      return { error: 'Provide either staffId or email' }
    }

    if (!record) return { error: 'Staff record not found' }
    const [gated] = gateStaffData([record as unknown as Record<string, unknown>], ctx.visibleCategories)
    return { staff: gated }
  },
}
