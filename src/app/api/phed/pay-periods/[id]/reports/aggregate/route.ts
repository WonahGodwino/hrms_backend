import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors, getCorsHeaders } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildAggregateComparison } from '@/app/lib/phed/reports'
import { exportAggregateToExcel, exportAggregateToPdf } from '@/app/lib/phed/report-export'
import { forCompany } from '@/app/lib/data/tenant'
import { deferExport } from '@/app/lib/exports/defer'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/aggregate?format=json|xlsx
// Returns: current period category summary vs the immediately preceding pay period
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  // PERF-003: build the file in the background when the client asks (Prefer: respond-async).
  const deferred = await deferExport(req);
  if (deferred) return deferred;
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requirePhedReadAccess(token)

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    // Fetch current period
    const currentPeriod = await prisma.phedPayPeriod.findUnique({
      where:  { id: params.id },
      select: { id: true, periodName: true, month: true, year: true, companyId: true, company: { select: { companyName: true } } },
    })
    if (!currentPeriod) return withCors(ApiResponse.notFound('Pay period not found'), origin)

    // Find the immediately preceding period (same company, highest month/year before current)
    const previousPeriod = await forCompany(currentPeriod.companyId).phedPayPeriod.findFirst({
      where: {
        computedPayrolls: { some: {} },
        OR: [
          { year: { lt: currentPeriod.year } },
          { year: currentPeriod.year, month: { lt: currentPeriod.month } },
        ],
      },
      select: { id: true, periodName: true, month: true, year: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    // Fetch payrolls for both periods in parallel
    const [currentPayrolls, previousPayrolls] = await Promise.all([
      prisma.phedComputedPayroll.findMany({ where: { payPeriodId: currentPeriod.id } }),
      previousPeriod
        ? prisma.phedComputedPayroll.findMany({ where: { payPeriodId: previousPeriod.id } })
        : Promise.resolve([]),
    ])

    const report = buildAggregateComparison(
      currentPayrolls,
      { periodName: currentPeriod.periodName, month: currentPeriod.month, year: currentPeriod.year },
      previousPayrolls,
      previousPeriod
        ? { periodName: previousPeriod.periodName, month: previousPeriod.month, year: previousPeriod.year }
        : null,
    )

    if (format === 'json') return withCors(ApiResponse.success(report), origin)

    if (format === 'xlsx') {
      const companyName = currentPeriod.company?.companyName ?? ''
      const buf         = await exportAggregateToExcel(report, companyName)
      const safeName    = currentPeriod.periodName.replace(/\s+/g, '-')
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="iad-aggregate-${safeName}.xlsx"`,
          ...getCorsHeaders(origin),
        },
      })
    }

    if (format === 'pdf') {
      const companyName = currentPeriod.company?.companyName ?? ''
      const buf         = await exportAggregateToPdf(report, companyName)
      const safeName    = currentPeriod.periodName.replace(/\s+/g, '-')
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="iad-aggregate-${safeName}.pdf"`,
          ...getCorsHeaders(origin),
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
