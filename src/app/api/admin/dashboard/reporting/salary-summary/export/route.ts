import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregatePayrollPeriod } from '@/app/lib/reporting/aggregatePayrollPeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency'
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export'
import type { ChartSpec } from '@/app/lib/reporting/chart-render'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

import { getQuarterFromMonth, type SalarySummaryPeriod } from '../period-filter'
import { getMonthName } from '@/app/lib/payroll/utils/monthParser'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const period = (searchParams.get('period') || 'monthly').toLowerCase() as SalarySummaryPeriod
    const companyId = searchParams.get('companyId')
    const staffRecordId = searchParams.get('staffRecordId')

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

    const { targetCompanyIds, error: accessError } = resolveTargetCompanies(user, companyId, accessibleCompanies)
    if (accessError) return withCors(ApiResponse.error(accessError, 403), origin)

    const { perMonth, perStaff, breakdowns, statutory, bankSchedule, summary } = await aggregatePayrollPeriod({
      targetCompanyIds,
      year,
      period,
      month,
      quarter,
      staffRecordId
    })

    const currency = await resolveReportCurrency(targetCompanyIds)
    const periodLabel =
        period === 'monthly'
            ? `${getMonthName(month)} ${year}`
            : period === 'quarterly'
                ? `Q${quarter} ${year}`
                : `${year}`

    const companyLabel =
        targetCompanyIds.length === 1
            ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName
            : undefined

    const currencyCode = currency.code === 'MIXED' ? 'NGN' : currency.code

    const monthlyCols: ReportColumn[] = [
      { header: 'Month', key: 'month', type: 'text', width: 14 },
      { header: 'Year', key: 'year', type: 'integer', width: 10 },
      { header: 'Base Pay', key: 'totalBasePay', type: 'currency', width: 18 },
      { header: 'Gross Pay', key: 'totalGrossPay', type: 'currency', width: 18 },
      { header: 'Net Salary', key: 'totalNetSalary', type: 'currency', width: 18 },
      { header: 'Tax', key: 'totalTax', type: 'currency', width: 16 },
      { header: 'Pension', key: 'totalPension', type: 'currency', width: 16 },
      { header: 'Bonus', key: 'totalBonus', type: 'currency', width: 16 },
      { header: 'Staff Count', key: 'staffCount', type: 'integer', width: 12 }
    ]

    const staffCols: ReportColumn[] = [
      { header: 'Staff ID', key: 'staffId', type: 'text', width: 14 },
      { header: 'Name', key: 'staffName', type: 'text', width: 24 },
      { header: 'Department', key: 'department', type: 'text', width: 18 },
      { header: 'Position', key: 'position', type: 'text', width: 18 },
      { header: 'Months Paid', key: 'monthsPaid', type: 'integer', width: 12 },
      { header: 'Base Pay', key: 'totalBasePay', type: 'currency', width: 18 },
      { header: 'Gross Pay', key: 'totalGrossPay', type: 'currency', width: 18 },
      { header: 'Net Salary', key: 'totalNetSalary', type: 'currency', width: 18 },
      { header: 'Tax', key: 'totalTax', type: 'currency', width: 16 },
      { header: 'Pension', key: 'totalPension', type: 'currency', width: 16 },
      { header: 'Bonus', key: 'totalBonus', type: 'currency', width: 16 }
    ]

    const deptCols: ReportColumn[] = [
      { header: 'Department', key: 'label', type: 'text', width: 22 },
      { header: 'Staff Count', key: 'staffCount', type: 'integer', width: 12 },
      { header: 'Gross Pay', key: 'totalGrossPay', type: 'currency', width: 18 },
      { header: 'Net Salary', key: 'totalNetSalary', type: 'currency', width: 18 },
      { header: 'Tax', key: 'totalTax', type: 'currency', width: 16 },
      { header: 'Pension', key: 'totalPension', type: 'currency', width: 16 }
    ]

    const statutoryRows = [
      { item: 'PAYE (Tax)', amount: statutory.paye },
      { item: 'Pension (Employee)', amount: statutory.pensionEmployee },
      { item: 'Pension (Employer)', amount: statutory.pensionEmployer },
      { item: 'NSITF', amount: statutory.nsitf },
      { item: 'ITF', amount: statutory.itf },
      { item: 'NHF', amount: statutory.nhf },
      { item: 'Medical Contribution', amount: statutory.medicalContribution }
    ]

    const bankCols: ReportColumn[] = [
      { header: 'Staff ID', key: 'staffId', type: 'text', width: 14 },
      { header: 'Staff Name', key: 'staffName', type: 'text', width: 24 },
      { header: 'Bank Name', key: 'bankName', type: 'text', width: 20 },
      { header: 'Account Number', key: 'accountNumber', type: 'text', width: 18 },
      { header: 'Net Salary', key: 'netSalary', type: 'currency', width: 18 }
    ]

    const charts: ChartSpec[] = []
    if (breakdowns.byDepartment.length > 0) {
      const top = breakdowns.byDepartment.slice(0, 8)
      charts.push({
        type: 'bar',
        title: 'Gross Pay by Department',
        labels: top.map((d) => d.label),
        series: [{ name: 'Gross Pay', values: top.map((d) => d.totalGrossPay) }]
      })
    }
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

    const buffer = await buildReportWorkbook({
      title: 'Finance Report',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: currencyCode,
      kpis: [
        { label: 'Total Gross Pay', value: summary.totalGrossPay },
        { label: 'Total Net Salary', value: summary.totalNetSalary },
        { label: 'Total Tax (PAYE)', value: summary.totalTax },
        { label: 'Total Pension', value: summary.totalPension },
        { label: 'Total NSITF', value: statutory.nsitf },
        { label: 'Total NHF', value: statutory.nhf },
        { label: 'Total ITF', value: statutory.itf },
        { label: 'Staff Covered', value: perStaff.length }
      ],
      charts,
      sheets: [
        { name: 'Monthly Breakdown', columns: monthlyCols, rows: perMonth },
        { name: 'Staff Breakdown', columns: staffCols, rows: perStaff },
        { name: 'Department Breakdown', columns: deptCols, rows: breakdowns.byDepartment },
        { name: 'Statutory Deductions', columns: [{ header: 'Item', key: 'item', type: 'text', width: 26 }, { header: 'Amount', key: 'amount', type: 'currency', width: 20 }], rows: statutoryRows },
        { name: 'Bank Payment Schedule', columns: bankCols, rows: bankSchedule }
      ]
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Finance Report (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`

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
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
