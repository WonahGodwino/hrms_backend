import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/iad-exited — IAD Page, Exited tab
// (PRD 13.3). Staff who left during this pay period's month, with their
// final settlement figures. Self-contained within PHED — no Offboarding
// module dependency (it has no backend today).
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
      where: { companyId: period.companyId, exitDate: { gte: monthStart, lt: monthEnd } },
      include: { staff: { select: { firstName: true, lastName: true, staffId: true, department: true } } },
      orderBy: { exitDate: 'desc' },
    })

    return withCors(
      ApiResponse.success(
        exits.map(e => ({
          staffName: `${e.staff.firstName} ${e.staff.lastName}`,
          staffIdCode: e.staff.staffId,
          department: e.staff.department,
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
