import { NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aggregatePayrollPeriod } from '@/app/lib/reporting/aggregatePayrollPeriod'
import { getAccessibleCompanies, resolveTargetCompanies } from '@/app/lib/reporting/access'
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency'
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export'
import { getMonthName } from '@/app/lib/payroll/utils/monthParser'
import { getQuarterFromMonth, type SalarySummaryPeriod } from '../../period-filter'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme'

// Standalone Bank Payment Schedule — the same data already computed inside
// the Full Report export, offered on its own so payroll-ops staff who just
// need "the list to hand to the bank" don't have to open the whole workbook.
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

    const { bankSchedule, summary } = await aggregatePayrollPeriod({ targetCompanyIds, year, period, month, quarter })
    const currency = await resolveReportCurrency(targetCompanyIds)
    const periodLabel =
        period === 'monthly' ? `${getMonthName(month)} ${year}` : period === 'quarterly' ? `Q${quarter} ${year}` : `${year}`
    const companyLabel = targetCompanyIds.length === 1 ? accessibleCompanies.find((c) => c.companyId === targetCompanyIds[0])?.companyName : undefined

    const bankCols: ReportColumn[] = [
      { header: 'Staff ID', key: 'staffId', type: 'text', width: 14 },
      { header: 'Staff Name', key: 'staffName', type: 'text', width: 24 },
      { header: 'Bank Name', key: 'bankName', type: 'text', width: 20 },
      { header: 'Account Number', key: 'accountNumber', type: 'text', width: 18 },
      { header: 'Net Salary', key: 'netSalary', type: 'currency', width: 18 }
    ]

    const buffer = await buildReportWorkbook({
      title: 'Bank Payment Schedule',
      subtitle: periodLabel,
      companyName: companyLabel,
      currency: currency.code === 'MIXED' ? 'NGN' : currency.code,
      kpis: [
        { label: 'Total Net Payable', value: summary.totalNetSalary },
        { label: 'Staff on Schedule', value: bankSchedule.length }
      ],
      sheets: [{ name: 'Bank Payment Schedule', columns: bankCols, rows: bankSchedule, totals: true }]
    })

    const safeCompany = safeFileName(companyLabel || 'Company')
    const fileName = `Bank Payment Schedule (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`
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
