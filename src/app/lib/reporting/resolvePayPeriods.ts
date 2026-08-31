// src/app/lib/reporting/resolvePayPeriods.ts
//
// Picks the two pay-periods (calendar months) the Changes tab compares by
// default: the most recent period that actually has payroll data, and the
// one immediately before it. When the most recent period IS the current
// calendar month, this is simply "current vs previous." When the current
// month hasn't been run yet, it naturally becomes "the last two uploaded
// periods" instead — one rule covers both cases and any gaps in upload
// history, rather than two separate code paths.
import { prisma } from '@/app/lib/db'
import { getMonthNumber } from '@/app/api/admin/dashboard/reporting/salary-summary/period-filter'

export type ResolvedPayPeriod = { month: string; year: number; monthNumber: number; label: string }

export async function resolvePayPeriods(targetCompanyIds: string[]): Promise<{
  periodA: ResolvedPayPeriod | null
  periodB: ResolvedPayPeriod | null
  usingFallback: boolean
}> {
  const distinctPeriods = await prisma.payroll.findMany({
    where: { companyId: { in: targetCompanyIds } },
    select: { month: true, year: true },
    distinct: ['month', 'year']
  })

  // Multiple raw spellings ("August" / "Aug" / "8") can point at the same
  // calendar month within one company's own upload history — collapse them
  // by (year, monthNumber) so the same month is never counted twice, keeping
  // whichever spelling was seen first for display.
  const byKey = new Map<string, ResolvedPayPeriod>()
  for (const p of distinctPeriods) {
    const monthNumber = getMonthNumber(p.month)
    if (!monthNumber) continue
    const key = `${p.year}-${monthNumber}`
    if (!byKey.has(key)) {
      byKey.set(key, { month: p.month, year: p.year, monthNumber, label: `${p.month} ${p.year}` })
    }
  }

  const sorted = Array.from(byKey.values()).sort((a, b) => (a.year === b.year ? a.monthNumber - b.monthNumber : a.year - b.year))

  if (sorted.length === 0) {
    return { periodA: null, periodB: null, usingFallback: false }
  }

  const periodA = sorted[sorted.length - 1]
  const periodB = sorted.length > 1 ? sorted[sorted.length - 2] : null

  const now = new Date()
  const isCurrentCalendarMonth = periodA.year === now.getFullYear() && periodA.monthNumber === now.getMonth() + 1

  return { periodA, periodB, usingFallback: !isCurrentCalendarMonth }
}
