import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { getQuarterFromMonth, type Period } from '@/app/lib/reporting/periodRange'
import { aggregateStaffInsights } from '@/app/lib/reporting/aggregateStaffInsights'
import { buildReportWorkbook } from '@/app/lib/reporting/excel-export'
import type { ChartSpec } from '@/app/lib/reporting/chart-render'
import { getMonthName } from '@/app/lib/payroll/utils/monthParser'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

// Executive Summary — a single-sheet, KPI + headline-chart-only workbook for
// a quick share, vs. the full multi-sheet Staff Insights workbook.
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
    const period = (searchParams.get('period') || 'monthly').toLowerCase() as Period
    const requestedCompanyId = searchParams.get('companyId')

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

    const { targetCompanyIds, error } = resolveTargetCompanies(user, requestedCompanyId, accessibleCompanies)
    if (error) return withCors(ApiResponse.error(error, 403), origin)

    const { headcount, movement, tenure, departments } = await aggregateStaffInsights({ targetCompanyIds, period, year, month, quarter })
    const periodLabel =
        period === 'monthly' ? `${getMonthName(month)} ${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
    const companyLabel = targetCompanyIds.length === 1 ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName : undefined

    const charts: ChartSpec[] = []
    if (departments.length > 0) {
      const top = departments.slice(0, 6)
      charts.push({
        type: 'bar',
        title: 'Active Headcount by Department',
        labels: top.map((d) => d.label),
        series: [{ name: 'Active', values: top.map((d) => d.activeStaff) }]
      })
    }
    if (tenure.bands.some((b) => b.count > 0)) {
      charts.push({
        type: 'pie',
        title: 'Tenure Band Distribution',
        labels: tenure.bands.map((b) => b.band),
        series: [{ name: 'Staff', values: tenure.bands.map((b) => b.count) }]
      })
    }

    const buffer = await buildReportWorkbook({
      title: 'Staff Insights Executive Summary',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: 'NGN',
      kpis: [
        { label: 'Active Staff', value: headcount.active },
        { label: 'New Hires', value: movement.newHires },
        { label: 'Attrition Rate', value: `${movement.attritionRate}%` },
        { label: 'Avg Tenure', value: tenure.averageYears != null ? `${tenure.averageYears} yrs` : 'N/A' }
      ],
      charts
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Staff Insights Executive Summary (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`
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
