// src/app/lib/reporting/resolveCurrency.ts
import { prisma } from '@/app/lib/db'
import { getCurrencySymbol, normalizeCurrencyCode } from '@/app/lib/currency'

export type ReportCurrency = {
  code: string
  symbol: string | null
}

// One or more companies may be in scope for a report (SUPER_ADMIN viewing
// "all companies"). If they all share a currency, resolve it; otherwise
// there's no single currency to format amounts in.
export async function resolveReportCurrency(targetCompanyIds: string[]): Promise<ReportCurrency> {
  if (targetCompanyIds.length === 1) {
    const company = await prisma.company.findUnique({
      where: { id: targetCompanyIds[0] },
      select: { baseCurrency: true }
    })
    const code = normalizeCurrencyCode(company?.baseCurrency || 'NGN')
    return { code, symbol: getCurrencySymbol(code) }
  }

  const companies = await prisma.company.findMany({
    where: { id: { in: targetCompanyIds } },
    select: { baseCurrency: true },
    distinct: ['baseCurrency']
  })
  const unique = Array.from(new Set(companies.map((c) => normalizeCurrencyCode(c.baseCurrency || 'NGN'))))

  if (unique.length === 1) {
    return { code: unique[0], symbol: getCurrencySymbol(unique[0]) }
  }
  return { code: 'MIXED', symbol: null }
}
