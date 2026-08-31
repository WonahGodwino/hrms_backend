// src/app/lib/reporting/periodRange.ts
//
// Shared real-Date period resolution — extracted from staff-insights/route.ts
// so Attendance Reporting and Leave Reporting use the exact same
// monthly/quarterly/yearly → [start, end) Date range logic, since (unlike
// Payroll's free-text month field) Attendance.date/LeaveRequest.startDate
// are real DateTime columns.
export type Period = 'monthly' | 'quarterly' | 'yearly'

export function getQuarterFromMonth(monthNumber: number): number {
  if (monthNumber >= 1 && monthNumber <= 3) return 1
  if (monthNumber >= 4 && monthNumber <= 6) return 2
  if (monthNumber >= 7 && monthNumber <= 9) return 3
  return 4
}

// Real [start, end) Date range for the requested period — end is exclusive,
// the first instant of the following period.
export function getPeriodRange(period: Period, year: number, month: number, quarter: number): { start: Date; end: Date } {
  if (period === 'yearly') {
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) }
  }
  if (period === 'quarterly') {
    const startMonth = (quarter - 1) * 3
    return { start: new Date(Date.UTC(year, startMonth, 1)), end: new Date(Date.UTC(year, startMonth + 3, 1)) }
  }
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) }
}

// The period immediately preceding the given one — same length, used for
// the Changes tabs' default "current vs previous" comparison.
export function getPreviousPeriodRange(period: Period, year: number, month: number, quarter: number): { start: Date; end: Date } {
  if (period === 'yearly') return getPeriodRange('yearly', year - 1, month, quarter)
  if (period === 'quarterly') {
    const prevQuarter = quarter === 1 ? 4 : quarter - 1
    const prevYear = quarter === 1 ? year - 1 : year
    return getPeriodRange('quarterly', prevYear, month, prevQuarter)
  }
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return getPeriodRange('monthly', prevYear, prevMonth, quarter)
}
