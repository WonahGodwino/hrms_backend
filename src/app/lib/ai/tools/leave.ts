// [ai-assistant] Leave tool — leave_summary (read-only, gated on leave category).
import type { ToolDefinition } from './types'

export const leaveSummary: ToolDefinition = {
  name: 'leave_summary',
  description: 'Get leave balance summary for the company or a specific staff member. Shows total, used, and pending days by leave type for the current year.',
  category: 'leave',
  parameters: {
    type: 'object',
    properties: {
      staff: { type: 'string', description: 'Optional: staff number or email, to get one person\'s leave summary' },
      year: { type: 'number', description: 'Year to query (defaults to current year)' },
    },
  },
  async execute(args, ctx) {
    const year = (args.year as number) ?? new Date().getFullYear()
    const where: Record<string, unknown> = { year }

    let person: { id: string; staffId: string; firstName: string; lastName: string } | null = null
    if (args.staff) {
      const ref = String(args.staff).trim()
      person = await ctx.prisma.staffRecord.findFirst({
        where: { companyId: ctx.companyId, OR: [{ staffId: ref }, { email: { equals: ref, mode: 'insensitive' } }] },
        select: { id: true, staffId: true, firstName: true, lastName: true },
      })
      if (!person) return { error: 'No staff member found for that staff number or email' }
      where.staffRecordId = person.id
    } else {
      where.staffRecord = { companyId: ctx.companyId }
    }

    const balances = await ctx.prisma.staffLeaveBalance.findMany({
      where,
      select: {
        totalDays: true,
        usedDays: true,
        pendingDays: true,
        carriedOver: true,
        leaveType: { select: { name: true } },
      },
      take: 200,
    })

    if (person) {
      // Named only when personal data is visible; the staff number is employment data.
      const showName = ctx.visibleCategories.includes('personal')
      const showNumber = ctx.visibleCategories.includes('employment')
      return { year, person: { ...(showNumber ? { staffNumber: person.staffId } : {}), ...(showName ? { name: `${person.firstName} ${person.lastName}`.trim() } : {}) }, balances, total: balances.length }
    }

    const byType: Record<string, { type: string; totalDays: number; usedDays: number; pendingDays: number; staffCount: number }> = {}
    for (const b of balances) {
      const key = b.leaveType.name
      if (!byType[key]) byType[key] = { type: key, totalDays: 0, usedDays: 0, pendingDays: 0, staffCount: 0 }
      byType[key].totalDays += b.totalDays
      byType[key].usedDays += b.usedDays
      byType[key].pendingDays += b.pendingDays
      byType[key].staffCount += 1
    }

    return { year, summary: Object.values(byType), recordsScanned: balances.length }
  },
}
