import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildFinancePayrollSummary } from '@/app/lib/phed/reports'
import {
  exportFinanceSummaryToExcel,
  exportFinanceSummaryToPdf,
} from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/finance-summary?format=json|xlsx|pdf
//
// Two-section report:
//   Payroll Cost  – category breakdown (Regular / Contract / NYSC)
//   Remittance    – per-bank breakdown with pension, statutory, union, coop & deduction totals
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const period = await (prisma as any).phedPayPeriod.findUnique({
      where:  { id: params.id },
      select: { id: true, periodName: true, month: true, year: true, companyId: true,
                company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)

    const companyName = period.company?.companyName ?? ''
    const safeName    = (period.periodName as string).replace(/\s+/g, '-')

    const payrolls = await (prisma as any).phedComputedPayroll.findMany({
      where: { payPeriodId: params.id },
    })

    const staffIds = payrolls.map((r: any) => r.staffId)

    const [allUnions, allCoops, allDeductions, staffUnions, staffCoops, staffDedLiabilities] =
      await Promise.all([
        (prisma as any).phedUnion.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
        (prisma as any).phedCooperative.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
        (prisma as any).phedDeductionLiability.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
        (prisma as any).phedStaffUnion.findMany({ where: { staffId: { in: staffIds } } }),
        (prisma as any).phedStaffCooperative.findMany({ where: { staffId: { in: staffIds } } }),
        (prisma as any).phedStaffDeductionLiability.findMany({ where: { staffId: { in: staffIds } } }),
      ])

    const report = buildFinancePayrollSummary(
      payrolls,
      allUnions.map((u: any) => ({ id: u.id, name: u.name, percentage: Number(u.percentage) })),
      allCoops.map((c: any) => ({ id: c.id, name: c.name })),
      allDeductions.map((d: any) => ({ id: d.id, name: d.name })),
      staffUnions,
      staffCoops,
      staffDedLiabilities,
      period.periodName,
      period.month,
      period.year,
    )

    if (format === 'json') return withCors(ApiResponse.success(report), origin)

    if (format === 'xlsx') {
      const buf = await exportFinanceSummaryToExcel(report, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="finance-summary-${safeName}.xlsx"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    if (format === 'pdf') {
      const buf = await exportFinanceSummaryToPdf(report, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="finance-summary-${safeName}.pdf"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
