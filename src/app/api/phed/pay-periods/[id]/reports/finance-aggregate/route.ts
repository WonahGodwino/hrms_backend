import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors, getCorsHeaders } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildFinanceAggregateComparison } from '@/app/lib/phed/reports'
import {
  exportFinanceAggregateToExcel,
  exportFinanceAggregateToPdf,
} from '@/app/lib/phed/report-export'
import { forCompany } from '@/app/lib/data/tenant'
import { deferExport } from '@/app/lib/exports/defer'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/finance-aggregate?format=json|xlsx|pdf
//
// Returns Finance Payroll Summary for the current period compared against
// the immediately preceding period with variance rows (Payroll Cost section).
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

    const currentPeriod = await prisma.phedPayPeriod.findUnique({
      where:  { id: params.id },
      select: { id: true, periodName: true, month: true, year: true, companyId: true,
                company: { select: { companyName: true } } },
    })
    if (!currentPeriod) return withCors(ApiResponse.notFound('Pay period not found'), origin)

    // Find the immediately preceding period (same company, must have computed payrolls)
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

    const companyName = currentPeriod.company?.companyName ?? ''
    const safeName    = currentPeriod.periodName.replace(/\s+/g, '-')

    // Company-wide entity definitions (same for both periods)
    const [allUnions, allCoops, allDeductions] = await Promise.all([
      forCompany(currentPeriod.companyId).phedUnion.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      forCompany(currentPeriod.companyId).phedCooperative.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      forCompany(currentPeriod.companyId).phedDeductionLiability.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    ])

    const unions       = allUnions.map((u: any) => ({ id: u.id, name: u.name, percentage: Number(u.percentage) }))
    const cooperatives = allCoops.map((c: any) => ({ id: c.id, name: c.name }))
    const deductions   = allDeductions.map((d: any) => ({ id: d.id, name: d.name }))

    // Current period data
    const currentPayrolls = await prisma.phedComputedPayroll.findMany({ where: { payPeriodId: currentPeriod.id } })
    const currentStaffIds = currentPayrolls.map((r: any) => r.staffId)
    const [currentStaffUnions, currentStaffCoops, currentStaffDeds] = await Promise.all([
      prisma.phedStaffUnion.findMany({ where: { staffId: { in: currentStaffIds } } }),
      prisma.phedStaffCooperative.findMany({ where: { staffId: { in: currentStaffIds } } }),
      prisma.phedStaffDeductionLiability.findMany({ where: { staffId: { in: currentStaffIds } } }),
    ])

    // Previous period data
    let previousPayrolls: any[]    = []
    let previousStaffUnions: any[] = []
    let previousStaffCoops: any[]  = []
    let previousStaffDeds: any[]   = []

    if (previousPeriod) {
      previousPayrolls = await prisma.phedComputedPayroll.findMany({ where: { payPeriodId: previousPeriod.id } })
      const prevStaffIds = previousPayrolls.map((r: any) => r.staffId)
      ;[previousStaffUnions, previousStaffCoops, previousStaffDeds] = await Promise.all([
        prisma.phedStaffUnion.findMany({ where: { staffId: { in: prevStaffIds } } }),
        prisma.phedStaffCooperative.findMany({ where: { staffId: { in: prevStaffIds } } }),
        prisma.phedStaffDeductionLiability.findMany({ where: { staffId: { in: prevStaffIds } } }),
      ])
    }

    const report = buildFinanceAggregateComparison(
      currentPayrolls,
      { periodName: currentPeriod.periodName, month: currentPeriod.month, year: currentPeriod.year },
      unions, cooperatives, deductions,
      currentStaffUnions, currentStaffCoops, currentStaffDeds,
      previousPayrolls,
      previousPeriod ? { periodName: previousPeriod.periodName, month: previousPeriod.month, year: previousPeriod.year } : null,
      previousStaffUnions, previousStaffCoops, previousStaffDeds,
    )

    if (format === 'json') return withCors(ApiResponse.success(report), origin)

    if (format === 'xlsx') {
      const buf = await exportFinanceAggregateToExcel(report, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="finance-aggregate-${safeName}.xlsx"`,
          ...getCorsHeaders(origin),
        },
      })
    }

    if (format === 'pdf') {
      const buf = await exportFinanceAggregateToPdf(report, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="finance-aggregate-${safeName}.pdf"`,
          ...getCorsHeaders(origin),
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
