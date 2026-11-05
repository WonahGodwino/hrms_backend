import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { getQuarterFromMonth, type Period } from '@/app/lib/reporting/periodRange'
import { aggregateStaffInsights } from '@/app/lib/reporting/aggregateStaffInsights'
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export'
import type { ChartSpec } from '@/app/lib/reporting/chart-render'
import { getMonthName } from '@/app/lib/payroll/utils/monthParser'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

// Standalone Departmental Report — headcount vs. capacity, tenure, movement
// and transfers per department, already computed inside the Full Report
// export, offered on its own for department-heads/HRBPs who only need their
// own area, not the full workforce workbook.
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

    const { departments } = await aggregateStaffInsights({ targetCompanyIds, period, year, month, quarter })
    const periodLabel =
        period === 'monthly' ? `${getMonthName(month)} ${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
    const companyLabel = targetCompanyIds.length === 1 ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName : undefined

    const departmentCols: ReportColumn[] = [
      { header: 'Department', key: 'label', type: 'text', width: 22 },
      { header: 'Business Unit', key: 'businessUnit', type: 'text', width: 20 },
      { header: 'Status', key: 'status', type: 'text', width: 12 },
      { header: 'Active Staff', key: 'activeStaff', type: 'integer', width: 12 },
      { header: 'Inactive Staff', key: 'inactiveStaff', type: 'integer', width: 12 },
      { header: 'Max Headcount', key: 'maxHeadcount', type: 'integer', width: 14 },
      { header: 'Capacity Utilization %', key: 'capacityUtilization', type: 'percent', width: 16 },
      { header: 'Avg Tenure (yrs)', key: 'averageTenureYears', type: 'number', width: 14 },
      { header: 'New Hires', key: 'newHires', type: 'integer', width: 12 },
      { header: 'Exits', key: 'exits', type: 'integer', width: 10 },
      { header: 'Attrition Rate %', key: 'attritionRate', type: 'percent', width: 14 },
      { header: 'Transfers In', key: 'transfersIn', type: 'integer', width: 12 },
      { header: 'Transfers Out', key: 'transfersOut', type: 'integer', width: 12 }
    ]

    const charts: ChartSpec[] = []
    if (departments.length > 0) {
      const top = departments.slice(0, 8)
      charts.push({
        type: 'bar',
        title: 'Active Headcount by Department',
        labels: top.map((d) => d.label),
        series: [{ name: 'Active', values: top.map((d) => d.activeStaff) }]
      })
    }

    const totalActive = departments.reduce((sum, d) => sum + d.activeStaff, 0)

    const buffer = await buildReportWorkbook({
      title: 'Departmental Report',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: 'NGN',
      kpis: [
        { label: 'Departments', value: departments.length },
        { label: 'Total Active Staff', value: totalActive }
      ],
      charts,
      sheets: [{ name: 'Departments Report', columns: departmentCols, rows: departments, totals: false }]
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Departmental Report (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`
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
