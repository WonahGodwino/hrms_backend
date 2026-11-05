import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregatePayrollPeriod } from '@/app/lib/reporting/aggregatePayrollPeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency'
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export'
import type { ChartSpec } from '@/app/lib/reporting/chart-render'
import { getMonthName } from '@/app/lib/payroll/utils/monthParser'
import { getQuarterFromMonth, type SalarySummaryPeriod } from '../../period-filter'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

// Standalone Statutory Compliance Summary — PAYE/Pension/NSITF/Medical
// totals, already computed inside the Full Report export, offered on its
// own for whoever handles regulatory filings and doesn't need payroll detail.
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || 'monthly').toLowerCase() as SalarySummaryPeriod
    const companyId = searchParams.get('companyId')

    const year = Number(searchParams.get('year') || new Date().getFullYear())
    const month = Number(searchParams.get('month') || new Date().getMonth() + 1)
    const quarter = Number(searchParams.get('quarter') || getQuarterFromMonth(month))

    if (!['monthly', 'quarterly', 'yearly'].includes(period)) {
      return withCors(ApiResponse.error('Invalid period. Use monthly, quarterly, or yearly', 400), origin)
    }

    const accessibleCompanies = await getAccessibleCompanies(user)
    if (accessibleCompanies.length === 0) {
      return withCors(ApiResponse.error('No companies assigned to your account', 403), origin)
    }

    const { targetCompanyIds, error } = resolveTargetCompanies(user, companyId, accessibleCompanies)
    if (error) return withCors(ApiResponse.error(error, 403), origin)

    const { statutory } = await aggregatePayrollPeriod({ targetCompanyIds, year, period, month, quarter })
    const currency = await resolveReportCurrency(targetCompanyIds)
    const periodLabel =
        period === 'monthly' ? `${getMonthName(month)} ${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
    const companyLabel = targetCompanyIds.length === 1 ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName : undefined

    const statutoryRows = [
      { item: 'PAYE (Tax)', amount: statutory.paye },
      { item: 'Pension (Employee)', amount: statutory.pensionEmployee },
      { item: 'Pension (Employer)', amount: statutory.pensionEmployer },
      { item: 'NSITF', amount: statutory.nsitf },
      { item: 'ITF', amount: statutory.itf },
      { item: 'Medical Contribution', amount: statutory.medicalContribution }
    ]
    const totalRemittance = statutory.paye + statutory.pensionEmployee + statutory.pensionEmployer + statutory.nsitf + statutory.itf + statutory.medicalContribution

    const charts: ChartSpec[] = [
      {
        type: 'pie',
        title: 'Statutory Remittance Breakdown',
        labels: statutoryRows.map((r) => r.item),
        series: [{ name: 'Amount', values: statutoryRows.map((r) => r.amount) }]
      }
    ]

    const buffer = await buildReportWorkbook({
      title: 'Statutory Compliance Summary',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: currency.code === 'MIXED' ? 'NGN' : currency.code,
      kpis: [{ label: 'Total Statutory Remittance', value: totalRemittance }],
      charts,
      sheets: [
        {
          name: 'Statutory Deductions',
          columns: [
            { header: 'Item', key: 'item', type: 'text', width: 28 },
            { header: 'Amount', key: 'amount', type: 'currency', width: 20 }
          ] as ReportColumn[],
          rows: statutoryRows,
          totals: true
        }
      ]
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Statutory Compliance (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`
    return withCors(
        new NextResponse(buffer as any, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': attachmentDisposition(fileName)
          }
        }),
        origin
    )
  } catch (err) {
    return withCors(handleApiError(err), origin)
  }
}
