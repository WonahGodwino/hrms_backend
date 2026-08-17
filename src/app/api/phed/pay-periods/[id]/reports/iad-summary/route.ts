import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { buildApprovalMemoSections } from '@/app/lib/phed/approval-memo-data'
import { exportReportResponse, IAD_SUMMARY_COLS } from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/iad-summary — IAD Page, Summary tab
// (PRD 13.3). Deliberately reuses the exact same Section A aggregation as
// the Approval Memo, so the figures the Head IAD reviews here are identical
// to what appears on the memo they are about to stamp.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'IAD_SUMMARY')

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const sections = await buildApprovalMemoSections(period.id)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'
    if (format === 'json')
      return withCors(ApiResponse.success({ periodName: sections.periodName, sectionA: sections.sectionA }), origin)

    const rows = (sections.sectionA ?? []).map((s: any) => ({
      label: s.label, gross: Number(s.gross) || 0, deduction: Number(s.deduction) || 0, netPay: Number(s.netPay) || 0,
    }))
    const exp = await exportReportResponse(format, 'IAD Summary', sections.periodName, IAD_SUMMARY_COLS, rows, period.company?.companyName ?? '', origin, 'iad-summary')
    if (exp) return exp
    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
