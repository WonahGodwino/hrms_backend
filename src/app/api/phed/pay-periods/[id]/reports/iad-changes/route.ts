import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { exportReportResponse, IAD_CHANGES_COLS } from '@/app/lib/phed/report-export'

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
      select: { id: true, companyId: true, periodName: true, year: true, month: true, createdAt: true, approvedAt: true, company: { select: { companyName: true } } },
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

    const items = changes.map(c => ({
      staffName: `${c.staff.firstName} ${c.staff.lastName}`,
      staffIdCode: c.staff.staffId,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changedBy: c.changedByName,
      changedAt: c.changedAt,
    }))

    const format = new URL(req.url).searchParams.get('format') ?? 'json'
    if (format === 'json') return withCors(ApiResponse.success(items), origin)

    const rows = items.map((i, idx) => ({
      ...i,
      sn: idx + 1,
      oldValue: i.oldValue ?? '',
      newValue: i.newValue ?? '',
      changedAt: i.changedAt ? new Date(i.changedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
    }))
    const exp = await exportReportResponse(format, 'IAD Changes', period.periodName ?? 'Unknown', IAD_CHANGES_COLS, rows, period.company?.companyName ?? '', origin, 'iad-changes')
    if (exp) return exp
    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
