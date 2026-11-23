import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors, getCorsHeaders } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { findAccessiblePayPeriod } from '@/app/lib/phed/pay-period-access'
import { buildWithheldReport } from '@/app/lib/phed/reports'
import { exportReportToPdf, exportWorkbook, WITHHELD_COLS } from '@/app/lib/phed/report-export'
import { buildWithheldSheet } from '@/app/lib/phed/payroll-sheets'
import { deferExport } from '@/app/lib/exports/defer'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/withheld?format=json|xlsx|pdf
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  // PERF-003: build the file in the background when the client asks (Prefer: respond-async).
  const deferred = await deferExport(req);
  if (deferred) return deferred;
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token  = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedReadAccess(token)

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    // SEC-018: the pay period must belong to a company the caller can access.
    if (!(await findAccessiblePayPeriod(user, params.id)))
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const [payrolls, validations] = await Promise.all([
      prisma.phedComputedPayroll.findMany({
        where:   { payPeriodId: params.id },
        orderBy: { staffName: 'asc' },
      }),
      prisma.phedValidation.findMany({
        where:  { payPeriodId: params.id, status: 'NO_FOR_PAYMENT' },
        select: { staffId: true, reason: true },
      }),
    ])

    const reasonMap = new Map<string, string | null>(
      validations.map((v: any) => [v.staffId as string, v.reason as string | null])
    )
    const data = buildWithheldReport(payrolls, reasonMap)

    if (format === 'json') return withCors(ApiResponse.success(data), origin)

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { periodName: true, month: true, year: true, company: { select: { companyName: true } } },
    })
    const periodName  = period?.periodName ?? 'Unknown'
    const companyName = period?.company?.companyName ?? ''
    const safeName    = periodName.replace(/\s+/g, '-')

    if (format === 'xlsx') {
      const sheet = buildWithheldSheet('Withheld Salaries', payrolls)
      const buf = await exportWorkbook([sheet], companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="withheld-${safeName}.xlsx"`,
          ...getCorsHeaders(origin),
        },
      })
    }

    if (format === 'pdf') {
      const buf = await exportReportToPdf('Withheld Salaries', periodName, WITHHELD_COLS, data, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="withheld-${safeName}.pdf"`,
          ...getCorsHeaders(origin),
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

