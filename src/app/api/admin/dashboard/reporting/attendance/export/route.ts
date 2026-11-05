import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregateAttendancePeriod } from '@/app/lib/reporting/aggregateAttendancePeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { getPeriodRange, getQuarterFromMonth, type Period } from '@/app/lib/reporting/periodRange'
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export'
import type { ChartSpec } from '@/app/lib/reporting/chart-render'
import { getMonthName } from '@/app/lib/payroll/utils/monthParser'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

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

    const { start, end } = getPeriodRange(period, year, month, quarter)
    const report = await aggregateAttendancePeriod(targetCompanyIds, start, end)

    const periodLabel =
        period === 'monthly' ? `${getMonthName(month)} ${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
    const companyLabel = targetCompanyIds.length === 1 ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName : undefined

    const flaggedRows = [
      ...report.chronicLate.map((r) => ({ type: 'Chronic Late', staffId: r.staffId, staffName: r.staffName, detail: `${r.lateCount} late arrivals` })),
      ...report.belowAverage.map((r) => ({
        type: 'Below Dept. Average',
        staffId: r.staffId,
        staffName: r.staffName,
        detail: `${r.rate}% vs dept avg ${r.departmentRate}% (-${r.gap}pts)`
      })),
      ...report.recognized.map((r) => ({ type: 'Recognized (Perfect Record)', staffId: r.staffId, staffName: r.staffName, detail: `${r.presentCount}/${r.slots} slots present` }))
    ]

    const charts: ChartSpec[] = []
    if (report.byDepartment.length > 0) {
      const top = report.byDepartment.slice(0, 8)
      charts.push({
        type: 'bar',
        title: 'Attendance Rate by Department',
        labels: top.map((d) => d.label),
        series: [{ name: 'Rate %', values: top.map((d) => d.rate) }],
        valueFormatter: (v) => `${v}%`
      })
    }
    if (report.byDayOfWeek.length > 0) {
      charts.push({
        type: 'bar',
        title: 'Attendance Rate by Day of Week',
        labels: report.byDayOfWeek.map((d) => d.label),
        series: [{ name: 'Rate %', values: report.byDayOfWeek.map((d) => d.rate) }],
        valueFormatter: (v) => `${v}%`
      })
    }

    const deptCols: ReportColumn[] = [
      { header: 'Department', key: 'label', type: 'text', width: 22 },
      { header: 'Staff Count', key: 'staffCount', type: 'integer', width: 12 },
      { header: 'Present', key: 'present', type: 'integer', width: 12 },
      { header: 'Late', key: 'late', type: 'integer', width: 10 },
      { header: 'Rate %', key: 'rate', type: 'percent', width: 12 },
      { header: 'Late Rate %', key: 'lateRate', type: 'percent', width: 14 }
    ]
    const dowCols: ReportColumn[] = [
      { header: 'Day', key: 'label', type: 'text', width: 16 },
      { header: 'Present', key: 'present', type: 'integer', width: 12 },
      { header: 'Slots', key: 'slots', type: 'integer', width: 12 },
      { header: 'Rate %', key: 'rate', type: 'percent', width: 12 }
    ]
    const flagCols: ReportColumn[] = [
      { header: 'Type', key: 'type', type: 'text', width: 24 },
      { header: 'Staff ID', key: 'staffId', type: 'text', width: 16 },
      { header: 'Name', key: 'staffName', type: 'text', width: 24 },
      { header: 'Detail', key: 'detail', type: 'text', width: 34 }
    ]

    const buffer = await buildReportWorkbook({
      title: 'Attendance Report',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: 'NGN',
      kpis: [
        { label: 'Overall Attendance Rate', value: report.overallRate != null ? `${report.overallRate}%` : 'N/A' },
        { label: 'Late Rate', value: report.lateRate != null ? `${report.lateRate}%` : 'N/A' },
        { label: 'Chronic Late Flags', value: report.chronicLate.length },
        { label: 'Recognized', value: report.recognized.length }
      ],
      charts,
      sheets: [
        { name: 'By Department', columns: deptCols, rows: report.byDepartment, totals: false },
        { name: 'By Day of Week', columns: dowCols, rows: report.byDayOfWeek, totals: false },
        { name: 'Flagged Staff', columns: flagCols, rows: flaggedRows, totals: false }
      ]
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Attendance Report (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`

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
