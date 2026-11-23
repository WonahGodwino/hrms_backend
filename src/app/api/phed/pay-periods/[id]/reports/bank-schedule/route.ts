import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors, getCorsHeaders } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { buildBankSchedule } from '@/app/lib/phed/reports'
import { exportReportToPdf, exportWorkbook, BANK_SCHEDULE_COLS } from '@/app/lib/phed/report-export'
import { buildBankSheet, periodLabels } from '@/app/lib/phed/payroll-sheets'
import { deferExport } from '@/app/lib/exports/defer'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/bank-schedule?format=json|xlsx|pdf
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  // PERF-003: build the file in the background when the client asks (Prefer: respond-async).
  const deferred = await deferExport(req);
  if (deferred) return deferred;
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'BANK_PAGE')

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

    // PRD 13.4: the Bank Page only becomes available to Treasury once this
    // period's Approval Memo (Module 12) reaches final approval. Full-access
    // roles (the four approval-chain officers, or HR/Admin) are exempt — they
    // may legitimately need to review the schedule before approving it.
    if (user.phedAccessRole === 'TREASURY_TEAM') {
      const memo = await prisma.phedApprovalMemo.findUnique({
        where: { payPeriodId: params.id },
        select: { status: true },
      })
      if (!memo || memo.status !== 'APPROVED') {
        return withCors(
          ApiResponse.forbidden('The Bank Page is not yet available — this period\'s payroll approval memo has not reached final approval.'),
          origin,
        )
      }
    }

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const payrolls = await prisma.phedComputedPayroll.findMany({
      where: { payPeriodId: params.id },
      orderBy: { staffName: 'asc' },
    })
    const data = buildBankSchedule(payrolls)

    if (format === 'json') return withCors(ApiResponse.success(data), origin)

    const periodName  = period.periodName
    const companyName = period.company?.companyName ?? ''
    const safeName    = periodName.replace(/\s+/g, '-')

    if (format === 'xlsx') {
      const sheet = buildBankSheet(`Bank_${periodLabels(period.month, period.year).apostrophe}`, payrolls)
      const buf = await exportWorkbook([sheet], companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="bank-schedule-${safeName}.xlsx"`,
          ...getCorsHeaders(origin),
        },
      })
    }

    if (format === 'pdf') {
      const buf = await exportReportToPdf('Bank Payment Schedule', periodName, BANK_SCHEDULE_COLS, data, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="bank-schedule-${safeName}.pdf"`,
          ...getCorsHeaders(origin),
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

