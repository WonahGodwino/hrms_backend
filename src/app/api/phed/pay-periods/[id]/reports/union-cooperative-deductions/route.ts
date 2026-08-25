import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { buildFinancePayrollSummary } from '@/app/lib/phed/reports'
import { exportReportResponse, exportWorkbook, UNION_COOP_COLS } from '@/app/lib/phed/report-export'
import { buildUnionCoopSheet, buildUnionCoopMaps, periodLabels } from '@/app/lib/phed/payroll-sheets'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/union-cooperative-deductions
// PRD 13.4 — Treasury's "Unions and Cooperatives Deductions" page: a
// consolidated view of NUEE/SSAEAC/etc. union dues and named cooperative
// contributions, mirroring Section B of the Approval Memo. Reuses the same
// Finance Summary aggregation already used elsewhere — no new computation.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'UNIONS_COOPERATIVES_DEDUCTIONS')

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

    const [allUnions, allCoops, staffUnions, staffCoops] = await Promise.all([
      prisma.phedUnion.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.phedCooperative.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.phedStaffUnion.findMany({ where: { staffId: { in: staffIds } } }),
      prisma.phedStaffCooperative.findMany({ where: { staffId: { in: staffIds } } }),
    ])

    const finance = buildFinancePayrollSummary(
      payrolls,
      allUnions.map(u => ({ id: u.id, name: u.name, percentage: Number(u.percentage) })),
      allCoops.map(c => ({ id: c.id, name: c.name })),
      [],
      staffUnions,
      staffCoops,
      [],
      period.periodName,
      period.month,
      period.year,
    )

    const totalRow = finance.remittance.find(r => r.bankName === 'TOTAL')
    const unions = allUnions.map(u => ({ name: u.name, amount: Number(totalRow?.[`u_${u.id}`] ?? 0) }))
    const cooperatives = allCoops.map(c => ({ name: c.name, amount: Number(totalRow?.[`c_${c.id}`] ?? 0) }))
    const total = [...unions, ...cooperatives].reduce((s, r) => s + r.amount, 0)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'
    if (format === 'json')
      return withCors(ApiResponse.success({ periodName: period.periodName, unions, cooperatives, total }), origin)

    if (format === 'xlsx') {
      const uc = buildUnionCoopMaps(
        allUnions.map(u => ({ id: u.id, name: u.name, percentage: Number(u.percentage) })),
        allCoops.map(c => ({ id: c.id, name: c.name })),
        staffUnions, staffCoops, payrolls,
      )
      const sheet = buildUnionCoopSheet(`Union_Coopera_${periodLabels(period.month, period.year).apostrophe}`, payrolls, {
        unionMap: uc.unionMap, ssaeacMap: uc.ssaeacMap, coopMap: uc.coopMap,
      })
      const buf = await exportWorkbook([sheet], period.company?.companyName ?? '')
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="union-cooperative-${period.periodName.replace(/\s+/g, '-')}.xlsx"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    const rows = [
      ...unions.map((u, i) => ({ sn: i + 1, type: 'Union', name: u.name, amount: u.amount })),
      ...cooperatives.map((c, i) => ({ sn: unions.length + i + 1, type: 'Cooperative', name: c.name, amount: c.amount })),
    ]
    const exp = await exportReportResponse('pdf', 'Unions & Cooperatives Deductions', period.periodName, UNION_COOP_COLS, rows, period.company?.companyName ?? '', origin, 'unions-cooperatives')
    if (exp) return exp
    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
