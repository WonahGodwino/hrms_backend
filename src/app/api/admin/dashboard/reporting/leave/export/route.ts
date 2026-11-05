import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregateLeavePeriod } from '@/app/lib/reporting/aggregateLeavePeriod'
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
    const report = await aggregateLeavePeriod(targetCompanyIds, start, end, year)

    const periodLabel =
      period === 'monthly' ? `${getMonthName(month)} ${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
    const companyLabel = targetCompanyIds.length === 1 ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName : undefined

    const flaggedRows = [
      ...report.sandwiching.map((r) => ({ type: 'Sandwiching', staffId: r.staffId, staffName: r.staffName, detail: `${r.startDate} to ${r.endDate} (adjacent: ${r.adjacentTo})` })),
      ...report.exhaustionRisk.map((r) => ({
        type: 'Exhaustion Risk',
        staffId: r.staffId,
        staffName: r.staffName,
        detail: `${r.leaveType}: ${r.usedDays}/${r.totalDays} used, projected remaining ${r.projectedRemaining}`
      })),
      ...report.highCarryOverRisk.map((r) => ({ type: 'High Carry-Over Risk', staffId: r.staffId, staffName: r.staffName, detail: `${r.leaveType}: ${r.remainingDays}/${r.totalDays} days remaining` }))
    ]

    const charts: ChartSpec[] = []
    if (report.byLeaveType.length > 0) {
      charts.push({
        type: 'pie',
        title: 'Utilization by Leave Type',
        labels: report.byLeaveType.map((t) => t.label),
        series: [{ name: 'Used Days', values: report.byLeaveType.map((t) => t.used) }]
      })
    }
    if (report.seasonalClustering.length > 0) {
      charts.push({
        type: 'line',
        title: 'Seasonal Clustering (days taken)',
        labels: report.seasonalClustering.map((s) => s.month),
        series: [{ name: 'Days Taken', values: report.seasonalClustering.map((s) => s.daysTaken) }]
      })
    }

    const overviewRows = [
      { metric: 'Utilization Rate %', value: report.utilizationRate ?? 'N/A' },
      { metric: 'Rejection Rate %', value: report.rejectionRate ?? 'N/A' },
      { metric: 'Notice Compliance Rate %', value: report.noticeCompliance.rate ?? 'N/A' },
      { metric: 'Average Approval Time (days)', value: report.approvalTime.averageDays ?? 'N/A' },
      { metric: 'Median Approval Time (days)', value: report.approvalTime.medianDays ?? 'N/A' },
      { metric: 'Total Requests', value: report.totalRequests },
      { metric: 'Total Days Taken', value: report.totalDaysTaken },
      { metric: 'Pending Manager Approvals', value: report.approvalFunnel.pendingManager },
      { metric: 'Pending HR Approvals', value: report.approvalFunnel.pendingHR }
    ]

    const typeCols: ReportColumn[] = [
      { header: 'Leave Type', key: 'label', type: 'text', width: 22 },
      { header: 'Used', key: 'used', type: 'integer', width: 10 },
      { header: 'Allocated', key: 'allocated', type: 'integer', width: 12 },
      { header: 'Rate %', key: 'rate', type: 'percent', width: 12 }
    ]
    const deptCols: ReportColumn[] = [
      { header: 'Department', key: 'label', type: 'text', width: 22 },
      { header: 'Staff Count', key: 'staffCount', type: 'integer', width: 12 },
      { header: 'Used', key: 'used', type: 'integer', width: 10 },
      { header: 'Allocated', key: 'allocated', type: 'integer', width: 12 },
      { header: 'Rate %', key: 'rate', type: 'percent', width: 12 }
    ]
    const seasonalCols: ReportColumn[] = [
      { header: 'Month', key: 'month', type: 'text', width: 14 },
      { header: 'Days Taken', key: 'daysTaken', type: 'number', width: 14 }
    ]
    const flagCols: ReportColumn[] = [
      { header: 'Type', key: 'type', type: 'text', width: 22 },
      { header: 'Staff ID', key: 'staffId', type: 'text', width: 16 },
      { header: 'Name', key: 'staffName', type: 'text', width: 24 },
      { header: 'Detail', key: 'detail', type: 'text', width: 42 }
    ]
    const approverCols: ReportColumn[] = [
      { header: 'Approver', key: 'approverName', type: 'text', width: 26 },
      { header: 'Avg. Days', key: 'averageDays', type: 'number', width: 14 },
      { header: 'Decisions', key: 'count', type: 'integer', width: 12 }
    ]
    const approvalDeptCols: ReportColumn[] = [
      { header: 'Department', key: 'label', type: 'text', width: 26 },
      { header: 'Avg. Days', key: 'averageDays', type: 'number', width: 14 },
      { header: 'Decisions', key: 'count', type: 'integer', width: 12 }
    ]

    const buffer = await buildReportWorkbook({
      title: 'Leave Report',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: 'NGN',
      kpis: [
        { label: 'Utilization Rate', value: report.utilizationRate != null ? `${report.utilizationRate}%` : 'N/A' },
        { label: 'Rejection Rate', value: report.rejectionRate != null ? `${report.rejectionRate}%` : 'N/A' },
        { label: 'Notice Compliance', value: report.noticeCompliance.rate != null ? `${report.noticeCompliance.rate}%` : 'N/A' },
        { label: 'Avg. Approval Time', value: report.approvalTime.averageDays != null ? `${report.approvalTime.averageDays}d` : 'N/A' }
      ],
      charts,
      sheets: [
        { name: 'Overview', columns: [{ header: 'Metric', key: 'metric', type: 'text', width: 32 }, { header: 'Value', key: 'value', type: 'number', width: 18 }], rows: overviewRows, totals: false },
        { name: 'By Leave Type', columns: typeCols, rows: report.byLeaveType, totals: false },
        { name: 'By Department', columns: deptCols, rows: report.byDepartment, totals: false },
        { name: 'Approval Time (Approver)', columns: approverCols, rows: report.approvalTimeByApprover, totals: false },
        { name: 'Approval Time (Dept)', columns: approvalDeptCols, rows: report.approvalTimeByDepartment, totals: false },
        { name: 'Seasonal Clustering', columns: seasonalCols, rows: report.seasonalClustering, totals: false },
        { name: 'Flags', columns: flagCols, rows: flaggedRows, totals: false }
      ]
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Leave Report (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`

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
