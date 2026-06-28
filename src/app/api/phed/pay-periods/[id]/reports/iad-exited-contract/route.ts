import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/iad-exited-contract — IAD Page, 6th
// tab. Exit records for the period's month where the staff category is
// CONTRACT or NYSC_IT. NYSC/IT are included because they are also fixed-term
// engagements whose exits are reviewed separately from permanent staff.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'IAD_EXITED')

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { companyId: true, year: true, month: true },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const monthStart = new Date(Date.UTC(period.year, period.month - 1, 1))
    const monthEnd = new Date(Date.UTC(period.year, period.month, 1))

    const exits = await prisma.phedStaffExit.findMany({
      where: {
        companyId: period.companyId,
        exitDate: { gte: monthStart, lt: monthEnd },
        staff: { category: { in: ['CONTRACT', 'NYSC_IT'] } },
      },
      include: {
        staff: { select: { firstName: true, lastName: true, staffId: true, department: true, category: true } },
      },
      orderBy: { exitDate: 'desc' },
    })

    return withCors(
      ApiResponse.success(
        exits.map(e => ({
          staffName: `${e.staff.firstName} ${e.staff.lastName}`,
          staffIdCode: e.staff.staffId,
          department: e.staff.department,
          category: e.staff.category,
          exitDate: e.exitDate,
          reason: e.reason,
          finalGrossPay: e.finalGrossPay,
          finalDeductions: e.finalDeductions,
          finalNetPay: e.finalNetPay,
          notes: e.notes,
          recordedBy: e.recordedByName,
        })),
      ),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
