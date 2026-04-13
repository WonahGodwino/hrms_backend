export type SalarySummaryPeriod = 'monthly' | 'quarterly' | 'yearly'

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
