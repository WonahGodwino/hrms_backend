import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { buildFinancePayrollSummary } from '@/app/lib/phed/reports'
import { exportReportResponse, LIABILITIES_COLS } from '@/app/lib/phed/report-export'
import { forCompany } from '@/app/lib/data/tenant'
import { deferExport } from '@/app/lib/exports/defer'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/liabilities
// PRD 13.4 — Treasury's "Liabilities to PHED" page: staff liabilities owed
// back to the company, deducted at source. Reuses the same Finance Summary
// aggregation already used elsewhere — no new computation.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  // PERF-003: build the file in the background when the client asks (Prefer: respond-async).
  const deferred = await deferExport(req);
  if (deferred) return deferred;
  const params = await props.params;
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'LIABILITIES_TO_PHED')

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, periodName: true, month: true, year: true, company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const payrolls = await prisma.phedComputedPayroll.findMany({ where: { payPeriodId: period.id } })
    const staffIds = payrolls.map(r => r.staffId)

    const [allDeductions, staffDedLiabilities] = await Promise.all([
      forCompany(period.companyId).phedDeductionLiability.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.phedStaffDeductionLiability.findMany({ where: { staffId: { in: staffIds } } }),
    ])

    const finance = buildFinancePayrollSummary(
      payrolls, [], [],
      allDeductions.map(d => ({ id: d.id, name: d.name })),
      [], [],
      staffDedLiabilities,
      period.periodName,
      period.month,
      period.year,
    )

    const totalRow = finance.remittance.find(r => r.bankName === 'TOTAL')
    const liabilities = allDeductions.map(d => ({ name: d.name, amount: Number(totalRow?.[`d_${d.id}`] ?? 0) }))
    const total = liabilities.reduce((s, r) => s + r.amount, 0)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'
    if (format === 'json')
      return withCors(ApiResponse.success({ periodName: period.periodName, liabilities, total }), origin)

    const rows = liabilities.map((l, i) => ({ sn: i + 1, name: l.name, amount: l.amount }))
    const exp = await exportReportResponse(format, 'Liabilities to PHED', period.periodName, LIABILITIES_COLS, rows, period.company?.companyName ?? '', origin, 'liabilities')
    if (exp) return exp
    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
