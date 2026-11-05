import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { getQuarterFromMonth, type Period } from '@/app/lib/reporting/periodRange'
import { aggregateStaffInsights } from '@/app/lib/reporting/aggregateStaffInsights'
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency'
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export'
import type { ChartSpec } from '@/app/lib/reporting/chart-render'
import { getMonthName } from '@/app/lib/payroll/utils/monthParser'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const FUNNEL_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Pending Review',
  HANDOVER_REQUESTED: 'Handover Requested',
  HANDOVER_SUBMITTED: 'Handover Submitted',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected'
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

    const { headcount, movement, tenure, attendance, departments, lifecycle, offboardingFunnel, devices, loansBenefits, structure } = await aggregateStaffInsights({
      targetCompanyIds,
      period,
      year,
      month,
      quarter
    })

    const currency = await resolveReportCurrency(targetCompanyIds)
    const periodLabel =
        period === 'monthly' ? `${getMonthName(month)} ${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
    const companyLabel = targetCompanyIds.length === 1 ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName : undefined

    const headcountRows = [
      { groupType: 'Overall', label: periodLabel, active: headcount.active, inactive: headcount.inactive, total: headcount.active + headcount.inactive },
      ...headcount.byDepartment.map((r) => ({ groupType: 'Department', label: r.label, active: r.active, inactive: r.inactive, total: r.active + r.inactive })),
      ...headcount.byBusinessUnit.map((r) => ({ groupType: 'Business Unit', label: r.label, active: r.active, inactive: r.inactive, total: r.active + r.inactive }))
    ]
    const headcountCols: ReportColumn[] = [
      { header: 'Group Type', key: 'groupType', type: 'text', width: 16 },
      { header: 'Label', key: 'label', type: 'text', width: 24 },
      { header: 'Active', key: 'active', type: 'integer', width: 12 },
      { header: 'Inactive', key: 'inactive', type: 'integer', width: 12 },
      { header: 'Total', key: 'total', type: 'integer', width: 12 }
    ]

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

    const attendanceCols: ReportColumn[] = [
      { header: 'Department', key: 'label', type: 'text', width: 24 },
      { header: 'Present Days', key: 'presentDays', type: 'integer', width: 14 },
      { header: 'Total Records', key: 'totalRecords', type: 'integer', width: 14 },
      { header: 'Rate %', key: 'rate', type: 'percent', width: 12 }
    ]

    const movementRows = [
      { metric: 'New Hires', value: movement.newHires },
      { metric: 'Resignations', value: movement.resignations },
      { metric: 'Terminations', value: movement.terminations },
      { metric: 'Total Exits', value: movement.totalExits },
      { metric: 'Attrition Rate %', value: movement.attritionRate }
    ]
    const tenureRows = [
      { metric: 'Average Tenure (years)', value: tenure.averageYears ?? 'N/A' },
      { metric: 'Sample Size (active, with hire date)', value: tenure.sampleSize },
      { metric: 'Missing Hire Date', value: tenure.missingHireDate },
      ...tenure.bands.map((b) => ({ metric: `Band: ${b.band}`, value: b.count }))
    ]

    const lifecycleRows = [
      { metric: 'Registered', value: lifecycle.registered },
      { metric: 'Unregistered', value: lifecycle.unregistered },
      { metric: 'Active & Registered', value: lifecycle.activeRegistered },
      { metric: 'Active & Unregistered', value: lifecycle.activeUnregistered }
    ]
    const funnelRows = offboardingFunnel.map((f) => ({ stage: FUNNEL_LABELS[f.status] || f.status, count: f.count }))

    // Sections for the staff-management features added since the report was
    // first built: Device Management, Staff Loans & Benefits, and the
    // org-structure (manager/grade) coverage signals.
    const deviceRows = [
      { metric: 'Active Devices (live sessions)', value: devices.totalActive },
      { metric: 'Staff With a Registered Device', value: devices.staffWithDevice },
      { metric: 'Archived (Past) Devices', value: devices.totalArchived },
      { metric: 'Blocked Staff Accounts', value: devices.blockedStaff },
      ...devices.byType.map((t) => ({ metric: `Device Type: ${t.type}`, value: t.count }))
    ]
    const loanStatusLabels: Record<string, string> = {
      PENDING_GUARANTOR: 'Pending Guarantor',
      PENDING_APPROVAL: 'Pending Approval',
      APPROVED: 'Approved (not yet disbursed)',
      DISBURSED: 'Disbursed',
      REPAID: 'Fully Repaid',
      DEFAULTED: 'Defaulted',
      REJECTED: 'Rejected',
      CANCELLED: 'Cancelled'
    }
    const loanRows = [
      { metric: 'Active Loans (approved + disbursed)', value: loansBenefits.loans.activeCount },
      { metric: 'Outstanding Loan Balance', value: loansBenefits.loans.outstandingBalance },
      { metric: 'Monthly Repayment Commitment', value: loansBenefits.loans.monthlyRepaymentCommitment },
      ...loansBenefits.loans.byStatus.map((s) => ({ metric: `Loan Status: ${loanStatusLabels[s.status] || s.status}`, value: s.count }))
    ]
    const benefitRows = [
      { metric: 'Active Benefit Allocations', value: loansBenefits.benefits.activeAllocations },
      { metric: 'Staff With an Active Benefit', value: loansBenefits.benefits.staffWithBenefit },
      { metric: 'Total Allocated Value', value: loansBenefits.benefits.allocatedValue },
      { metric: 'Total Used Value', value: loansBenefits.benefits.usedValue },
      { metric: 'Remaining Value', value: loansBenefits.benefits.remainingValue }
    ]
    const structureRows = [
      { metric: 'Active Staff', value: structure.activeStaff },
      { metric: 'Staff With a Manager', value: structure.staffWithManager },
      { metric: 'Staff Without a Manager', value: structure.staffWithoutManager },
      { metric: 'Manager Coverage %', value: structure.managerCoverage ?? 'N/A' }
    ]

    const charts: ChartSpec[] = []
    if (departments.length > 0) {
      const top = departments.slice(0, 8)
      charts.push({
        type: 'bar',
        title: 'Active Headcount by Department',
        labels: top.map((d) => d.label),
        series: [{ name: 'Active Staff', values: top.map((d) => d.activeStaff) }]
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
      title: 'Staff Insights Report',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: currency.code === 'MIXED' ? 'NGN' : currency.code,
      kpis: [
        { label: 'Active Staff', value: headcount.active },
        { label: 'New Hires', value: movement.newHires },
        { label: 'Attrition Rate', value: `${movement.attritionRate}%` },
        { label: 'Avg Tenure', value: tenure.averageYears != null ? `${tenure.averageYears} yrs` : 'N/A' }
      ],
      charts,
      sheets: [
        { name: 'Headcount Summary', columns: headcountCols, rows: headcountRows, totals: false },
        {
          name: 'Movement',
          columns: [
            { header: 'Metric', key: 'metric', type: 'text', width: 26 },
            { header: 'Value', key: 'value', type: 'number', width: 16 }
          ],
          rows: movementRows,
          totals: false
        },
        {
          name: 'Tenure Distribution',
          columns: [
            { header: 'Metric', key: 'metric', type: 'text', width: 34 },
            { header: 'Value', key: 'value', type: 'number', width: 16 }
          ],
          rows: tenureRows,
          totals: false
        },
        { name: 'Departments Report', columns: departmentCols, rows: departments, totals: false },
        { name: 'Attendance Summary', columns: attendanceCols, rows: attendance.byDepartment, totals: false },
        {
          name: 'Staff Lifecycle',
          columns: [
            { header: 'Metric', key: 'metric', type: 'text', width: 26 },
            { header: 'Value', key: 'value', type: 'integer', width: 16 }
          ],
          rows: lifecycleRows,
          totals: false
        },
        {
          name: 'Offboarding Funnel',
          columns: [
            { header: 'Stage', key: 'stage', type: 'text', width: 24 },
            { header: 'Staff Count', key: 'count', type: 'integer', width: 14 }
          ],
          rows: funnelRows,
          totals: false
        },
        {
          name: 'Devices & Access',
          columns: [
            { header: 'Metric', key: 'metric', type: 'text', width: 34 },
            { header: 'Value', key: 'value', type: 'number', width: 16 }
          ],
          rows: deviceRows,
          totals: false
        },
        {
          name: 'Staff Loans',
          columns: [
            { header: 'Metric', key: 'metric', type: 'text', width: 34 },
            { header: 'Value', key: 'value', type: 'number', width: 16 }
          ],
          rows: loanRows,
          totals: false
        },
        {
          name: 'Staff Benefits',
          columns: [
            { header: 'Metric', key: 'metric', type: 'text', width: 34 },
            { header: 'Value', key: 'value', type: 'number', width: 16 }
          ],
          rows: benefitRows,
          totals: false
        },
        {
          name: 'Org Structure',
          columns: [
            { header: 'Metric', key: 'metric', type: 'text', width: 34 },
            { header: 'Value', key: 'value', type: 'number', width: 16 }
          ],
          rows: structureRows,
          totals: false
        }
      ]
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Staff Insights (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`

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
