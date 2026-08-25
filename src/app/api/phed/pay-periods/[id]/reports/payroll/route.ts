import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { exportWorkbook, exportSummaryWorkbookExcel } from '@/app/lib/phed/report-export'
import {
  periodLabels,
  buildRegularWorkbook,
  buildContractWorkbook,
  buildIndividualWorkbook,
  buildSummaryData,
  buildIadWorkbook,
  buildUnionCoopMaps,
  fetchStateOfResidenceMap,
  type RegisterCtx,
  type SummaryWorkbookData,
} from '@/app/lib/phed/payroll-sheets'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/payroll?scope=regular|contract|individual&format=xlsx|json
// Bundled workbooks that replicate the reference templates sheet-for-sheet.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedReadAccess(token)
    if (user.phedAccessRole === 'HEAD_INTERNAL_AUDIT') {
      return withCors(ApiResponse.error('The Internal Audit role reviews the Internal Audit report only.', 403), origin)
    }

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { companyId: true, periodName: true, month: true, year: true, company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const p = new URL(req.url).searchParams
    const scope  = p.get('scope')  ?? 'regular'
    const format = p.get('format') ?? 'xlsx'

    const where: any = { payPeriodId: params.id }
    if (scope === 'regular')   where.category = 'REGULAR'
    if (scope === 'contract')  where.category = { in: ['CONTRACT', 'NYSC_IT'] }

    const payrolls = await (prisma as any).phedComputedPayroll.findMany({ where })

    // Extra staff attributes for the register (pay point, approved role).
    const staff = await (prisma as any).phedStaff.findMany({
      where: { companyId: period.companyId },
      select: { id: true, jobTitle: true, payPoint: { select: { name: true } } },
    })
    const ctx: RegisterCtx = {
      payPointMap: new Map<string, string>(),
      jobTitleMap: new Map<string, string>(),
      stateMap: await fetchStateOfResidenceMap(prisma, period.companyId),
    }
    for (const s of staff) {
      if (s.payPoint?.name) ctx.payPointMap!.set(s.id, s.payPoint.name)
      if (s.jobTitle) ctx.jobTitleMap!.set(s.id, s.jobTitle)
    }

    // Union / cooperative per-column amounts (NUEE, SSAEAC, named coops).
    const allPayrolls = await (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: params.id } })
    const staffIds = allPayrolls.map((r: any) => r.staffId)
    const [unions, coops, staffUnions, staffCoops] = await Promise.all([
      (prisma as any).phedUnion.findMany({ where: { companyId: period.companyId, isActive: true } }),
      (prisma as any).phedCooperative.findMany({ where: { companyId: period.companyId, isActive: true } }),
      (prisma as any).phedStaffUnion.findMany({ where: { staffId: { in: staffIds } } }),
      (prisma as any).phedStaffCooperative.findMany({ where: { staffId: { in: staffIds } } }),
    ])
    const uc = buildUnionCoopMaps(
      unions.map((u: any) => ({ id: u.id, name: u.name, percentage: Number(u.percentage) })),
      coops.map((c: any) => ({ id: c.id, name: c.name })),
      staffUnions,
      staffCoops,
      allPayrolls,
    )
    ctx.unionMap = uc.unionMap
    ctx.ssaeacMap = uc.ssaeacMap
    ctx.coopMap = uc.coopMap

    const labels = periodLabels(period.month, period.year)

    let sheets: any = null
    let summaryData: SummaryWorkbookData | null = null
    if (scope === 'regular') {
      sheets = buildRegularWorkbook(labels, payrolls, ctx)
    } else if (scope === 'contract') {
      const contract = payrolls.filter((r: any) => r.category === 'CONTRACT')
      const nysc     = payrolls.filter((r: any) => r.category === 'NYSC_IT')
      sheets = buildContractWorkbook(labels, contract, nysc, ctx)
    } else if (scope === 'individual') {
      sheets = buildIndividualWorkbook(payrolls, ctx)
    } else if (scope === 'summary') {
      const prevPeriod = await prisma.phedPayPeriod.findFirst({
        where: {
          companyId: period.companyId,
          OR: [{ year: { lt: period.year } }, { year: period.year, month: { lt: period.month } }],
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        select: { id: true },
      })
      const prevPayrolls = prevPeriod
        ? await (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: prevPeriod.id } })
        : []
      summaryData = buildSummaryData(labels, payrolls, prevPayrolls, ctx)
    } else if (scope === 'iad') {
      const prevPeriod = await prisma.phedPayPeriod.findFirst({
        where: {
          companyId: period.companyId,
          OR: [{ year: { lt: period.year } }, { year: period.year, month: { lt: period.month } }],
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        select: { id: true },
      })
      const prevPayrolls = prevPeriod
        ? await (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: prevPeriod.id } })
        : []
      sheets = buildIadWorkbook(labels, payrolls, prevPayrolls)
    } else {
      return withCors(ApiResponse.error('Invalid scope. Use regular, contract, individual, summary, or iad', 400), origin)
    }

    if (format === 'json') {
      if (summaryData) return withCors(ApiResponse.success({ periodName: period.periodName, summary: summaryData }), origin)
      return withCors(ApiResponse.success({ periodName: period.periodName, sheets }), origin)
    }

    const companyName = period.company?.companyName ?? ''
    const safeName    = period.periodName.replace(/\s+/g, '-')
    const buf = summaryData
      ? await exportSummaryWorkbookExcel(summaryData, companyName)
      : await exportWorkbook(sheets, companyName)
    return new NextResponse(buf as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="payroll-${scope}-${safeName}.xlsx"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) { return withCors(handleApiError(e), origin) }
}
