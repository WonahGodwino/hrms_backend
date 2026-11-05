import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregatePayrollPeriod } from '@/app/lib/reporting/aggregatePayrollPeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency'
import { buildReportWorkbook } from '@/app/lib/reporting/excel-export'
import type { ChartSpec } from '@/app/lib/reporting/chart-render'
import { getMonthName } from '@/app/lib/payroll/utils/monthParser'
import { getQuarterFromMonth, type SalarySummaryPeriod } from '../../period-filter'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

// Executive Summary — a single-sheet, KPI + headline-chart-only workbook for
// a quick share (board pack, leadership update), vs. the full multi-sheet
// Finance Report workbook.
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

    const { perMonth, perStaff, breakdowns, summary } = await aggregatePayrollPeriod({ targetCompanyIds, year, period, month, quarter })
    const currency = await resolveReportCurrency(targetCompanyIds)
    const periodLabel =
        period === 'monthly' ? `${getMonthName(month)} ${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
    const companyLabel = targetCompanyIds.length === 1 ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName : undefined

    const charts: ChartSpec[] = []
    if (perMonth.length > 1) {
      charts.push({
        type: 'line',
        title: 'Gross vs Net Pay Trend',
        labels: perMonth.map((m) => `${m.month} ${m.year}`),
        series: [
          { name: 'Gross Pay', values: perMonth.map((m) => m.totalGrossPay) },
          { name: 'Net Salary', values: perMonth.map((m) => m.totalNetSalary) }
        ]
      })
    }
    if (breakdowns.byDepartment.length > 0) {
      const top = breakdowns.byDepartment.slice(0, 6)
      charts.push({
        type: 'bar',
        title: 'Gross Pay by Department',
        labels: top.map((d) => d.label),
        series: [{ name: 'Gross Pay', values: top.map((d) => d.totalGrossPay) }]
      })
    }

    const buffer = await buildReportWorkbook({
      title: 'Finance Executive Summary',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: currency.code === 'MIXED' ? 'NGN' : currency.code,
      kpis: [
        { label: 'Total Gross Pay', value: summary.totalGrossPay },
        { label: 'Total Net Salary', value: summary.totalNetSalary },
        { label: 'Total Tax (PAYE)', value: summary.totalTax },
        { label: 'Staff Covered', value: perStaff.length }
      ],
      charts
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Finance Executive Summary (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`
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
