import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildFinanceAggregateComparison } from '@/app/lib/phed/reports'
import {
  exportFinanceAggregateToExcel,
  exportFinanceAggregateToPdf,
} from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/finance-aggregate?format=json|xlsx|pdf
//
// Returns Finance Payroll Summary for the current period compared against
// the immediately preceding period with variance rows (Payroll Cost section).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const currentPeriod = await (prisma as any).phedPayPeriod.findUnique({
      where:  { id: params.id },
      select: { id: true, periodName: true, month: true, year: true, companyId: true,
                company: { select: { companyName: true } } },
    })
    if (!currentPeriod) return withCors(ApiResponse.notFound('Pay period not found'), origin)

    // Find the immediately preceding period (same company, must have computed payrolls)
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

    const companyName = currentPeriod.company?.companyName ?? ''
    const safeName    = currentPeriod.periodName.replace(/\s+/g, '-')

    // Company-wide entity definitions (same for both periods)
    const [allUnions, allCoops, allDeductions] = await Promise.all([
      (prisma as any).phedUnion.findMany({ where: { companyId: currentPeriod.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedCooperative.findMany({ where: { companyId: currentPeriod.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedDeductionLiability.findMany({ where: { companyId: currentPeriod.companyId, isActive: true }, orderBy: { name: 'asc' } }),
    ])

    const unions       = allUnions.map((u: any) => ({ id: u.id, name: u.name, percentage: Number(u.percentage) }))
    const cooperatives = allCoops.map((c: any) => ({ id: c.id, name: c.name }))
    const deductions   = allDeductions.map((d: any) => ({ id: d.id, name: d.name }))

    // Current period data
    const currentPayrolls = await (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: currentPeriod.id } })
    const currentStaffIds = currentPayrolls.map((r: any) => r.staffId)
    const [currentStaffUnions, currentStaffCoops, currentStaffDeds] = await Promise.all([
      (prisma as any).phedStaffUnion.findMany({ where: { staffId: { in: currentStaffIds } } }),
      (prisma as any).phedStaffCooperative.findMany({ where: { staffId: { in: currentStaffIds } } }),
      (prisma as any).phedStaffDeductionLiability.findMany({ where: { staffId: { in: currentStaffIds } } }),
    ])

    // Previous period data
    let previousPayrolls: any[]    = []
    let previousStaffUnions: any[] = []
    let previousStaffCoops: any[]  = []
    let previousStaffDeds: any[]   = []

    if (previousPeriod) {
      previousPayrolls = await (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: previousPeriod.id } })
      const prevStaffIds = previousPayrolls.map((r: any) => r.staffId)
      ;[previousStaffUnions, previousStaffCoops, previousStaffDeds] = await Promise.all([
        (prisma as any).phedStaffUnion.findMany({ where: { staffId: { in: prevStaffIds } } }),
        (prisma as any).phedStaffCooperative.findMany({ where: { staffId: { in: prevStaffIds } } }),
        (prisma as any).phedStaffDeductionLiability.findMany({ where: { staffId: { in: prevStaffIds } } }),
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
          'Access-Control-Allow-Origin': origin ?? '*',
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
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
