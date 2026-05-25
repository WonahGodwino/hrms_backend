import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildMultiPeriodAggregate } from '@/app/lib/phed/reports'
import { exportMultiPeriodAggregateToExcel } from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/reports/aggregate?companyId=xxx&format=json|xlsx
// Returns all computed pay periods for the company in chronological order,
// each with its payroll summary and variance vs the preceding period.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const p         = new URL(req.url).searchParams
    const companyId = p.get('companyId')
    const format    = p.get('format') ?? 'json'

    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)

    // All periods with computed payrolls, oldest first
    const periods = await (prisma as any).phedPayPeriod.findMany({
      where:   { companyId, computedPayrolls: { some: {} } },
      select:  { id: true, periodName: true, month: true, year: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })

    if (periods.length === 0)
      return withCors(ApiResponse.success({ periods: [] }), origin)

    // Load all payrolls for all periods in parallel
    const payrollsByPeriod = await Promise.all(
      periods.map((pd: any) =>
        (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: pd.id } })
      )
    )

    const report = buildMultiPeriodAggregate(
      periods.map((pd: any, i: number) => ({
        payrolls:   payrollsByPeriod[i],
        periodName: pd.periodName,
        month:      pd.month,
        year:       pd.year,
      }))
    )

    if (format === 'json') return withCors(ApiResponse.success(report), origin)

    if (format === 'xlsx') {
      const company = await prisma.company.findUnique({
        where:  { id: companyId },
        select: { companyName: true },
      })
      const companyName = company?.companyName ?? ''
      const buf         = await exportMultiPeriodAggregateToExcel(report, companyName)
      const lastPeriod  = periods[periods.length - 1]
      const safeName    = (lastPeriod.periodName as string).replace(/\s+/g, '-')
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="iad-aggregate-all-${safeName}.xlsx"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json or xlsx', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
