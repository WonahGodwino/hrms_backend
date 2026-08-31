export type SalarySummaryPeriod = 'monthly' | 'quarterly' | 'yearly'

// A pay-period is one calendar month (e.g. "August"). Payroll.month is
// stored as free text — "August", "Aug", "8" all mean the same month — so
// every month-vs-month comparison anywhere in reporting goes through this
// same parser rather than comparing the raw strings.
export function getMonthNumber(month: string): number {
  const normalized = (month || '').trim().toLowerCase()
  const monthMap: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12
  }

  if (monthMap[normalized]) return monthMap[normalized]

  const asNumber = Number(normalized)
  if (Number.isFinite(asNumber) && asNumber >= 1 && asNumber <= 12) {
    return asNumber
  }

  return 0
}

export function getQuarterFromMonth(monthNumber: number): number {
  if (monthNumber >= 1 && monthNumber <= 3) return 1
  if (monthNumber >= 4 && monthNumber <= 6) return 2
  if (monthNumber >= 7 && monthNumber <= 9) return 3
  return 4
}

function getMonthName(monthNumber: number): string {
  const names = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december'
  ]
  return names[monthNumber - 1] || ''
}

export function getQuarterRange(quarter: number): { start: number; end: number } {
  if (quarter === 1) return { start: 1, end: 3 }
  if (quarter === 2) return { start: 4, end: 6 }
  if (quarter === 3) return { start: 7, end: 9 }
  return { start: 10, end: 12 }
}

export function getMonthQueryCandidates(monthNumber: number): string[] {
  const monthName = getMonthName(monthNumber)
  const monthAbbrev = monthName.slice(0, 3)
  const asNumber = String(monthNumber)
  const asPadded = String(monthNumber).padStart(2, '0')

  return Array.from(
    new Set([
      monthName,
      monthName.toUpperCase(),
      monthName.charAt(0).toUpperCase() + monthName.slice(1),
      monthAbbrev,
      monthAbbrev.toUpperCase(),
      monthAbbrev.charAt(0).toUpperCase() + monthAbbrev.slice(1),
      asNumber,
      asPadded
    ])
  )
}

export function getPeriodMonthCandidates(
  period: SalarySummaryPeriod,
  month: number,
  quarter: number
): string[] {
  if (period === 'yearly') return []
  if (period === 'monthly') return getMonthQueryCandidates(month)

  const quarterRange = getQuarterRange(quarter)
  return Array.from(
    new Set(
      Array.from(
        { length: quarterRange.end - quarterRange.start + 1 },
        (_, index) => quarterRange.start + index
      ).flatMap((monthNumber) => getMonthQueryCandidates(monthNumber))
    )
  )
}
