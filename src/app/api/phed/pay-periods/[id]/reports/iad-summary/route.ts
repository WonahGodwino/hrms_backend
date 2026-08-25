import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { buildPayrollSummary } from '@/app/lib/phed/reports'
import { exportReportResponse, IAD_SUMMARY_COLS } from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/iad-summary — IAD Page, Summary tab
// (PRD 13.3). Returns the same payroll-cost breakdown as the Reports tab's
// "IAD Summary Report" (head count, gross, employer pension, NSITF, ITF and
// total payroll cost per category) so the two IAD views never disagree.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'IAD_SUMMARY')

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, periodName: true, month: true, year: true, company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const payrolls = await prisma.phedComputedPayroll.findMany({ where: { payPeriodId: params.id } })
    const summary  = buildPayrollSummary(payrolls, period.periodName, period.month, period.year)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'
    if (format === 'json')
      return withCors(ApiResponse.success(summary), origin)

    // xlsx/pdf — employer pension / NSITF / ITF are null for NYSC/IT (exempt),
    // so render them as 0 in exported tables.
    const rows = summary.rows.map((r) => ({
      label:            r.label,
      headCount:        r.headCount,
      grossPay:         r.grossPay,
      employerPension:  r.employerPension ?? 0,
      nsitf:            r.nsitf           ?? 0,
      itf:              r.itf             ?? 0,
      totalPayrollCost: r.totalPayrollCost,
    }))
    const exp = await exportReportResponse(format, 'IAD Summary', summary.periodName, IAD_SUMMARY_COLS, rows, period.company?.companyName ?? '', origin, 'iad-summary')
    if (exp) return exp
    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
