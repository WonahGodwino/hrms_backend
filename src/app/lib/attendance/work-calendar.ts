// src/app/lib/attendance/work-calendar.ts
//
// A company's attendance work calendar — working days, opening/closing time,
// late grace — plus holidays, and the holiday auto-attendance rule:
//
//   On a holiday that falls on a working day, every active staff member who
//   isn't on approved leave is clocked in at the opening time and out at the
//   closing time, automatically (method "holiday", recorded by SYSTEM).
//
// Auto-attendance is materialised lazily and idempotently ("on the day"): the
// self clock route, the daily dashboard, the holidays sync endpoint (also
// cron-callable) and saving a holiday all call ensureHolidayAttendance(). It
// only ever INSERTS rows that don't exist yet (skipDuplicates on the
// companyId+staffId+date unique key), so a real clock-in a staff member made
// before the holiday was added is never overwritten, and running it twice is
// harmless.
//
// All wall-clock times are Africa/Lagos (see business-day.ts).
import { prisma } from '@/app/lib/db'
import { parseWorkWeekPattern } from '@/app/lib/reporting/workingDays'
import { businessDateParts, startOfBusinessDay, endOfBusinessDay } from './business-day'

export const DEFAULT_START_TIME = '09:00'
export const DEFAULT_END_TIME = '17:00'
export const HOLIDAY_METHOD = 'holiday'
export const HOLIDAY_TYPES = ['PUBLIC', 'COMPANY', 'OTHER'] as const
export type HolidayType = (typeof HOLIDAY_TYPES)[number]

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map((n) => parseInt(n, 10))
  return h * 60 + m
}

export type WorkSettings = {
  workDays: number[] // ISO weekday numbers, 1=Monday … 7=Sunday
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
  lateGraceMinutes: number
}

export async function getWorkSettings(companyId: string): Promise<WorkSettings> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { workWeekPattern: true, standardStartTime: true, standardEndTime: true, lateGraceMinutes: true },
  })
  return {
    workDays: parseWorkWeekPattern(company?.workWeekPattern),
    startTime: isValidTime(company?.standardStartTime) ? company!.standardStartTime! : DEFAULT_START_TIME,
    endTime: isValidTime(company?.standardEndTime) ? company!.standardEndTime! : DEFAULT_END_TIME,
    lateGraceMinutes: company?.lateGraceMinutes ?? 0,
  }
}

// ISO weekday (1=Mon … 7=Sun) of the Lagos-local day containing `date`.
export function isoWeekday(date: Date): number {
  const { weekday } = businessDateParts(date) // 0=Sun … 6=Sat
  return weekday === 0 ? 7 : weekday
}

export function isWorkingDay(settings: WorkSettings, date: Date): boolean {
  return settings.workDays.includes(isoWeekday(date))
}

// The real instant for "HH:mm" Lagos time on the business day of `day`.
export function atBusinessTime(day: Date, time: string): Date {
  return new Date(startOfBusinessDay(day).getTime() + timeToMinutes(time) * 60_000)
}

// Clock-IN has no time-of-day restriction — staff may clock in early or
// late; lateness is recorded via status (isLate, lateness.ts), not refused.
//
// Clock-OUT, however, is only valid from closing time onward: a staff
// member can't end their day before the company's closing time has passed.
export type ClockOutWindowCheck = { allowed: true } | { allowed: false; closesAt: string }

export function checkClockOutWindow(settings: WorkSettings, now: Date): ClockOutWindowCheck {
  const closesAt = atBusinessTime(now, settings.endTime)
  if (now.getTime() < closesAt.getTime()) {
    return { allowed: false, closesAt: settings.endTime }
  }
  return { allowed: true }
}

// The holiday (one-off or recurring) on the Lagos-local day of `date`, if any.
export async function findHoliday(companyId: string, date: Date) {
  const from = startOfBusinessDay(date)
  const to = endOfBusinessDay(date)
  const oneOff = await prisma.publicHoliday.findFirst({
    where: { companyId, date: { gte: from, lte: to } },
    orderBy: { createdAt: 'asc' },
  })
  if (oneOff) return oneOff

  // Recurring holidays repeat every year on the same Lagos month/day.
  const { month, day } = businessDateParts(date)
  const recurring = await prisma.publicHoliday.findMany({ where: { companyId, isRecurring: true } })
  return (
    recurring.find((h) => {
      const p = businessDateParts(h.date)
      return p.month === month && p.day === day
    }) ?? null
  )
}

export type HolidaySyncResult = {
  date: string
  holiday: string | null
  created: number
  skipped?: 'not-a-holiday' | 'not-a-working-day' | 'in-the-future'
}

// Creates holiday auto-attendance for one Lagos business day. Safe to call
// repeatedly; never touches existing attendance rows.
export async function ensureHolidayAttendance(companyId: string, date: Date = new Date()): Promise<HolidaySyncResult> {
  const day = startOfBusinessDay(date)
  const key = day.toISOString()
  if (day.getTime() > startOfBusinessDay(new Date()).getTime()) {
    return { date: key, holiday: null, created: 0, skipped: 'in-the-future' }
  }

  const holiday = await findHoliday(companyId, day)
  if (!holiday) return { date: key, holiday: null, created: 0, skipped: 'not-a-holiday' }

  const settings = await getWorkSettings(companyId)
  if (!isWorkingDay(settings, day)) return { date: key, holiday: holiday.name, created: 0, skipped: 'not-a-working-day' }

  const dayEnd = endOfBusinessDay(day)
  const [staff, onLeave] = await Promise.all([
    prisma.staffRecord.findMany({ where: { companyId, isActive: true }, select: { id: true } }),
    prisma.leaveRequest.findMany({
      where: { companyId, status: 'APPROVED', startDate: { lte: dayEnd }, endDate: { gte: day } },
      select: { staffRecordId: true },
    }),
  ])
  const leaveIds = new Set(onLeave.map((l) => l.staffRecordId))
  const eligible = staff.filter((s) => !leaveIds.has(s.id))
  if (eligible.length === 0) return { date: key, holiday: holiday.name, created: 0 }

  const signInTime = atBusinessTime(day, settings.startTime)
  const signOutTime = atBusinessTime(day, settings.endTime)
  const { count } = await prisma.attendance.createMany({
    data: eligible.map((s) => ({
      companyId,
      staffId: s.id,
      date: day,
      signInTime,
      signOutTime,
      status: 'PRESENT',
      method: HOLIDAY_METHOD,
      recordedByRole: 'SYSTEM',
      notes: `Holiday: ${holiday.name}`,
    })),
    skipDuplicates: true,
  })
  return { date: key, holiday: holiday.name, created: count }
}

// When a holiday is deleted or moved, remove the untouched auto rows it made.
// Only rows still exactly as the system created them (method "holiday") are
// removed — anything a person has since edited stays.
export async function removeHolidayAttendance(companyId: string, date: Date, holidayName: string): Promise<number> {
  const day = startOfBusinessDay(date)
  const { count } = await prisma.attendance.deleteMany({
    where: { companyId, date: day, method: HOLIDAY_METHOD, notes: `Holiday: ${holidayName}` },
  })
  return count
}
