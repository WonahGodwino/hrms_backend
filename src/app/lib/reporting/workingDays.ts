// src/app/lib/reporting/workingDays.ts
//
// Shared business-day calendar logic — generalized from the day-counting
// already used (correctly) by the Leave module's
// backend/src/app/api/leaves/apply/route.ts (calculateWorkingDays), which
// reads Company.workWeekPattern and PublicHoliday. Every existing Attendance
// route (daily/weekly/monthly/staff) hardcodes its own Mon–Fri-only version
// of this and has no holiday awareness at all — this helper is the one,
// correct implementation both Attendance Reporting and Leave Reporting build
// on, so a company's actual work week and public holidays are respected
// consistently everywhere they're used.
import { prisma } from '@/app/lib/db'

// ISO-style weekday numbering used by Company.workWeekPattern: 1=Monday ... 7=Sunday.
function parseWorkWeekPattern(pattern: string | null | undefined): number[] {
  const defaultPattern = [1, 2, 3, 4, 5]
  if (!pattern) return defaultPattern

  try {
    if (pattern.startsWith('[')) {
      const parsed = JSON.parse(pattern)
      if (Array.isArray(parsed) && parsed.every((d) => typeof d === 'number')) {
        return parsed
      }
    }
    if (/^[1-7]+$/.test(pattern)) {
      return pattern.split('').map((d) => parseInt(d, 10))
    }
    if (pattern.includes(',')) {
      return pattern
        .split(',')
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => !isNaN(d))
    }
    return defaultPattern
  } catch {
    return defaultPattern
  }
}

export type CompanyCalendar = {
  workDays: number[] // ISO weekday numbers, 1=Monday..7=Sunday
  holidaySet: Set<string> // "YYYY-MM-DD" for one-off holidays, "M-D" for recurring ones
}

// Loads a company's work-week pattern + public holidays once, so a caller
// checking many dates (e.g. every day in a month) doesn't re-query per day.
export async function loadCompanyCalendar(companyId: string, rangeStart?: Date, rangeEnd?: Date): Promise<CompanyCalendar> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { workWeekPattern: true }
  })

  const holidays = await prisma.publicHoliday.findMany({
    where: {
      companyId,
      OR: [...(rangeStart && rangeEnd ? [{ date: { gte: rangeStart, lte: rangeEnd } }] : []), { isRecurring: true }]
    }
  })

  const holidaySet = new Set<string>()
  for (const holiday of holidays) {
    if (holiday.isRecurring) {
      holidaySet.add(`${holiday.date.getMonth() + 1}-${holiday.date.getDate()}`)
    } else {
      holidaySet.add(holiday.date.toISOString().split('T')[0])
    }
  }

  return { workDays: parseWorkWeekPattern(company?.workWeekPattern), holidaySet }
}

export function isWorkingDayInCalendar(calendar: CompanyCalendar, date: Date): boolean {
  const dayOfWeek = date.getDay()
  const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek
  if (!calendar.workDays.includes(adjustedDay)) return false

  const dateString = date.toISOString().split('T')[0]
  const monthDay = `${date.getMonth() + 1}-${date.getDate()}`
  return !calendar.holidaySet.has(dateString) && !calendar.holidaySet.has(monthDay)
}

// One-off check for a single date (fetches the calendar itself — prefer
// loadCompanyCalendar + isWorkingDayInCalendar when checking many dates).
export async function isWorkingDay(companyId: string, date: Date): Promise<boolean> {
  const calendar = await loadCompanyCalendar(companyId, date, date)
  return isWorkingDayInCalendar(calendar, date)
}

// Every working day in [start, end], inclusive, as an array of Date objects
// (midnight, matching how Attendance.date/date-keys are stored).
export async function getWorkingDaysInRange(companyId: string, start: Date, end: Date): Promise<Date[]> {
  const calendar = await loadCompanyCalendar(companyId, start, end)
  const days: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    if (isWorkingDayInCalendar(calendar, current)) {
      days.push(new Date(current))
    }
    current.setDate(current.getDate() + 1)
  }
  return days
}
