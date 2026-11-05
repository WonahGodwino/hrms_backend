// [ai-assistant] Attendance tool — attendance_summary (read-only, gated on employment).
// Counts only. Clock-in locations, coordinates and addresses are never read, and a person is named only when the company lets the
// assistant see personal data.
import type { ToolDefinition } from './types'

const DAY_MS = 86_400_000
const MAX_DAYS = 92
const MAX_ROWS = 10_000

const STATUSES = ['PRESENT', 'LATE', 'PARTIAL', 'ABSENT'] as const

function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null
  const d = new Date(value.slice(0, 10) + 'T00:00:00.000Z')
  return Number.isNaN(d.getTime()) ? null : d
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const hoursBetween = (a?: Date | null, b?: Date | null) => (a && b && b > a ? (b.getTime() - a.getTime()) / 3_600_000 : null)

export const attendanceSummary: ToolDefinition = {
  name: 'attendance_summary',
  description:
    'Summarise attendance for a period: how many present, late, partial and absent records, per department, and for one person if you name them by staff number or email. Periods are limited to 92 days; the default is the last 30 days. Dates are YYYY-MM-DD. Locations are never included.',
  category: 'employment',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'First day, YYYY-MM-DD (default: 30 days before "to")' },
      to: { type: 'string', description: 'Last day, YYYY-MM-DD (default: today)' },
      department: { type: 'string', description: 'Only this department (exact name from list_departments)' },
      staff: { type: 'string', description: 'One person: staff number or email. Returns their daily records.' },
    },
  },
  async execute(args, ctx) {
    const today = new Date()
    const to = parseDay(args.to) ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const from = parseDay(args.from) ?? new Date(to.getTime() - 29 * DAY_MS)
    if (from > to) return { error: '"from" must not be after "to".' }
    if ((to.getTime() - from.getTime()) / DAY_MS + 1 > MAX_DAYS) return { error: `Choose a period of at most ${MAX_DAYS} days.` }

    const where: Record<string, unknown> = { companyId: ctx.companyId, date: { gte: from, lte: to } }
    let person: { id: string; staffId: string; firstName: string; lastName: string } | null = null
    if (args.staff) {
      const ref = String(args.staff).trim()
      person = await ctx.prisma.staffRecord.findFirst({
        where: { companyId: ctx.companyId, OR: [{ staffId: ref }, { email: { equals: ref, mode: 'insensitive' } }] },
        select: { id: true, staffId: true, firstName: true, lastName: true },
      })
      if (!person) return { error: 'No staff member found for that staff number or email.' }
      where.staffId = person.id
    }
    if (args.department) where.staffRecord = { department: { equals: String(args.department).trim(), mode: 'insensitive' } }

    const rows = await ctx.prisma.attendance.findMany({
      where,
      select: { date: true, status: true, signInTime: true, signOutTime: true, staffRecord: { select: { department: true } } },
      orderBy: { date: 'asc' },
      take: MAX_ROWS + 1,
    })
    const truncated = rows.length > MAX_ROWS
    const used = truncated ? rows.slice(0, MAX_ROWS) : rows

    const blank = () => ({ PRESENT: 0, LATE: 0, PARTIAL: 0, ABSENT: 0, other: 0, records: 0 }) as Record<string, number>
    const total = blank()
    const byDept = new Map<string, Record<string, number>>()
    let hours = 0
    let hoursCount = 0
    for (const r of used) {
      const key = (STATUSES as readonly string[]).includes(String(r.status)) ? String(r.status) : 'other'
      total[key] += 1
      total.records += 1
      const dept = r.staffRecord?.department?.trim() || 'No department'
      const bucket = byDept.get(dept) ?? blank()
      bucket[key] += 1
      bucket.records += 1
      byDept.set(dept, bucket)
      const h = hoursBetween(r.signInTime, r.signOutTime)
      if (h !== null) {
        hours += h
        hoursCount += 1
      }
    }

    const result: Record<string, unknown> = {
      period: { from: iso(from), to: iso(to) },
      totals: total,
      averageHoursWorked: hoursCount ? Math.round((hours / hoursCount) * 10) / 10 : null,
      byDepartment: [...byDept.entries()].map(([department, counts]) => ({ department, ...counts })).sort((a, b) => a.department.localeCompare(b.department)),
      ...(truncated ? { note: `Only the first ${MAX_ROWS} records were counted. Narrow the period or department.` } : {}),
    }

    if (person) {
      const showName = ctx.visibleCategories.includes('personal')
      result.person = { staffNumber: person.staffId, ...(showName ? { name: `${person.firstName} ${person.lastName}`.trim() } : {}) }
      result.days = used.slice(0, 100).map((r) => ({
        date: iso(r.date),
        status: r.status ?? 'PRESENT',
        hours: (() => {
          const h = hoursBetween(r.signInTime, r.signOutTime)
          return h === null ? null : Math.round(h * 10) / 10
        })(),
      }))
      delete result.byDepartment
    }
    return result
  },
}
