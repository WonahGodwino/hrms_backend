import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildAggregateComparison } from '@/app/lib/phed/reports'
import { exportAggregateToExcel, exportAggregateToPdf } from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/aggregate?format=json|xlsx
// Returns: current period category summary vs the immediately preceding pay period
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requirePhedReadAccess(token)

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    // Fetch current period
    const currentPeriod = await (prisma as any).phedPayPeriod.findUnique({
      where:  { id: params.id },
      select: { id: true, periodName: true, month: true, year: true, companyId: true, company: { select: { companyName: true } } },
    })
    if (!currentPeriod) return withCors(ApiResponse.notFound('Pay period not found'), origin)

    // Find the immediately preceding period (same company, highest month/year before current)
    const previousPeriod = await (prisma as any).phedPayPeriod.findFirst({
      where: {
        companyId: currentPeriod.companyId,
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
      (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: currentPeriod.id } }),
      previousPeriod
        ? (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: previousPeriod.id } })
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
          'Access-Control-Allow-Origin': origin ?? '*',
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
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
