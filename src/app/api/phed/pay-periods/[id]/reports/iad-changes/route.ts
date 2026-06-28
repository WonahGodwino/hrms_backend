import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/iad-changes — IAD Page, Changes tab
// (PRD 13.3). Every payroll-affecting PhedStaff edit recorded between the
// previous pay period and this one.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'IAD_CHANGES')

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, year: true, month: true, createdAt: true, approvedAt: true },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const previousPeriod = await prisma.phedPayPeriod.findFirst({
      where: {
        companyId: period.companyId,
        OR: [{ year: { lt: period.year } }, { year: period.year, month: { lt: period.month } }],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { createdAt: true, approvedAt: true },
    })

    // Periods are created at the start of their lifecycle (DRAFT), before any
    // of the staff edits that feed into their computation happen — so the
    // window must run up to when the period was finalized (approvedAt), not
    // when its record was first created.
    const windowStart = previousPeriod?.approvedAt ?? previousPeriod?.createdAt ?? new Date(0)
    const windowEnd = period.approvedAt ?? new Date()

    const changes = await prisma.phedChangeLog.findMany({
      where: { companyId: period.companyId, changedAt: { gte: windowStart, lte: windowEnd } },
      include: { staff: { select: { firstName: true, lastName: true, staffId: true } } },
      orderBy: { changedAt: 'desc' },
    })

    return withCors(
      ApiResponse.success(
        changes.map(c => ({
          staffName: `${c.staff.firstName} ${c.staff.lastName}`,
          staffIdCode: c.staff.staffId,
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          changedBy: c.changedByName,
          changedAt: c.changedAt,
        })),
      ),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
