import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { exportReportResponse, IAD_EXITED_COLS } from '@/app/lib/phed/report-export'
import { forCompany } from '@/app/lib/data/tenant'
import { deferExport } from '@/app/lib/exports/defer'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/iad-exited — IAD Page, Exited tab
// (PRD 13.3). Staff who left during this pay period's month, with their
// final settlement figures. Self-contained within PHED — no Offboarding
// module dependency (it has no backend today).
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
      select: { companyId: true, periodName: true, year: true, month: true, company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const monthStart = new Date(Date.UTC(period.year, period.month - 1, 1))
    const monthEnd = new Date(Date.UTC(period.year, period.month, 1))

    const exits = await forCompany(period.companyId).phedStaffExit.findMany({
      where: { exitDate: { gte: monthStart, lt: monthEnd } },
      include: { staff: { select: { firstName: true, lastName: true, staffId: true, department: true } } },
      orderBy: { exitDate: 'desc' },
    })

    const items = exits.map(e => ({
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
    }))

    const format = new URL(req.url).searchParams.get('format') ?? 'json'
    if (format === 'json') return withCors(ApiResponse.success(items), origin)

    const rows = items.map((i, idx) => ({
      ...i,
      sn: idx + 1,
      exitDate: i.exitDate ? new Date(i.exitDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
    }))
    const exp = await exportReportResponse(format, 'IAD Exited Staff', period.periodName ?? 'Unknown', IAD_EXITED_COLS, rows, period.company?.companyName ?? '', origin, 'iad-exited')
    if (exp) return exp
    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
