import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { buildFinancePayrollSummary } from '@/app/lib/phed/reports'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/liabilities
// PRD 13.4 — Treasury's "Liabilities to PHED" page: staff liabilities owed
// back to the company, deducted at source. Reuses the same Finance Summary
// aggregation already used elsewhere — no new computation.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'LIABILITIES_TO_PHED')

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, periodName: true, month: true, year: true },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const payrolls = await prisma.phedComputedPayroll.findMany({ where: { payPeriodId: period.id } })
    const staffIds = payrolls.map(r => r.staffId)

    const [allDeductions, staffDedLiabilities] = await Promise.all([
      prisma.phedDeductionLiability.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
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

    return withCors(ApiResponse.success({ periodName: period.periodName, liabilities, total }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
