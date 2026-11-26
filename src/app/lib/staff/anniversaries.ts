// Work anniversaries from StaffRecord.hireDate.
//
// All dates are calendar dates in UTC (hireDate is stored as a date at midnight UTC).
// A 29 February hire celebrates on 28 February in years that are not leap years.
// A hire date today or in the future gives 0 years and no anniversary yet.

const DAY_MS = 24 * 60 * 60 * 1000

export const ANNIVERSARY_NOTIFICATION_TYPE = 'WORK_ANNIVERSARY'
export const DEFAULT_ANNIVERSARY_DAYS = 30
export const MAX_ANNIVERSARY_DAYS = 365

export type AnniversaryStaff = {
  id: string
  firstName: string
  lastName: string
  department: string | null
  hireDate: Date | null
  isActive: boolean
}

export type UpcomingAnniversary = {
  staffId: string
  name: string
  department: string | null
  hireDate: string
  nextDate: string
  years: number
  daysAway: number
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Midnight UTC of the calendar day `date` falls on. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/** The anniversary of `hireDate` in `year` (29 Feb moves to 28 Feb in non-leap years). */
export function anniversaryInYear(hireDate: Date, year: number): Date {
  const month = hireDate.getUTCMonth()
  let day = hireDate.getUTCDate()
  if (month === 1 && day === 29 && !isLeapYear(year)) day = 28
  return new Date(Date.UTC(year, month, day))
}

/** Whole years of service completed on `today` (0 when the hire date is today or later). */
export function yearsOfService(hireDate: Date, today: Date): number {
  const hire = startOfUtcDay(hireDate)
  const day = startOfUtcDay(today)
  if (hire.getTime() >= day.getTime()) return 0
  const year = day.getUTCFullYear()
  const years = year - hire.getUTCFullYear()
  return anniversaryInYear(hire, year).getTime() <= day.getTime() ? years : years - 1
}

/**
 * The next anniversary on or after `today`, with the years it marks. Null when the
 * hire date is today or in the future (no anniversary to celebrate yet).
 */
export function nextAnniversary(hireDate: Date, today: Date): { date: Date; years: number } | null {
  const hire = startOfUtcDay(hireDate)
  const day = startOfUtcDay(today)
  if (hire.getTime() >= day.getTime()) return null
  let year = day.getUTCFullYear()
  let date = anniversaryInYear(hire, year)
  if (date.getTime() < day.getTime()) {
    year += 1
    date = anniversaryInYear(hire, year)
  }
  const years = year - hire.getUTCFullYear()
  if (years < 1) {
    // Hired earlier this year: the first anniversary is next year.
    return { date: anniversaryInYear(hire, hire.getUTCFullYear() + 1), years: 1 }
  }
  return { date, years }
}

/** True when `today` is a work anniversary of at least one year. */
export function isAnniversaryToday(hireDate: Date, today: Date): boolean {
  const next = nextAnniversary(hireDate, today)
  return !!next && next.years >= 1 && next.date.getTime() === startOfUtcDay(today).getTime()
}

/** Clamp the `days` query value to 1..365 (default 30). */
export function parseAnniversaryDays(raw: string | null): number {
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_ANNIVERSARY_DAYS
  return Math.min(MAX_ANNIVERSARY_DAYS, Math.max(1, Math.floor(n)))
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Active staff with a hire date whose anniversary falls within `days` days of `today`
 * (today included), soonest first.
 */
export function upcomingAnniversaries(staff: AnniversaryStaff[], today: Date, days: number): UpcomingAnniversary[] {
  const day = startOfUtcDay(today)
  const result: UpcomingAnniversary[] = []
  for (const s of staff) {
    if (!s.isActive || !s.hireDate) continue
    const next = nextAnniversary(s.hireDate, day)
    if (!next) continue
    const daysAway = Math.round((next.date.getTime() - day.getTime()) / DAY_MS)
    if (daysAway > days) continue
    result.push({
      staffId: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      department: s.department,
      hireDate: isoDate(startOfUtcDay(s.hireDate)),
      nextDate: isoDate(next.date),
      years: next.years,
      daysAway,
    })
  }
  return result.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name))
}

/** Dedupe key for one anniversary notification: the staff member and the year of service. */
export function anniversaryKey(staffRecordId: string, years: number): string {
  return `${staffRecordId}:${years}`
}

/** Reads the dedupe key out of a stored notification's `data` (object or JSON string). */
export function anniversaryKeyFromData(data: unknown): string | null {
  let value: unknown = data
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch (_e) {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const { staffRecordId, years } = value as { staffRecordId?: unknown; years?: unknown }
  if (typeof staffRecordId !== 'string' || typeof years !== 'number') return null
  return anniversaryKey(staffRecordId, years)
}
