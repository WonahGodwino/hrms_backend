import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { forCompany } from '@/app/lib/data/tenant'
import { deferExport } from '@/app/lib/exports/defer'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/iad-exited-regular — IAD Page, Exited
// tab (regular staff split). Exit records for the period's month where the
// staff category is REGULAR. Complements iad-exited-contract so permanent and
// fixed-term exits are reported separately (FE guide §10).
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  // PERF-003: build the file in the background when the client asks (Prefer: respond-async).
  const deferred = await deferExport(req);
  if (deferred) return deferred;
  const params = await props.params;
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

    const exits = await forCompany(period.companyId).phedStaffExit.findMany({
      where: {
        exitDate: { gte: monthStart, lt: monthEnd },
        staff: { category: 'REGULAR' },
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
