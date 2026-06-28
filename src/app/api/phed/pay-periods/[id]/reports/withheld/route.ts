import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildWithheldReport } from '@/app/lib/phed/reports'
import { exportReportToExcel, exportReportToPdf, WITHHELD_COLS } from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/withheld?format=json|xlsx|pdf
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token  = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requirePhedReadAccess(token)

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const [payrolls, validations] = await Promise.all([
      (prisma as any).phedComputedPayroll.findMany({
        where:   { payPeriodId: params.id },
        orderBy: { staffName: 'asc' },
      }),
      (prisma as any).phedValidation.findMany({
        where:  { payPeriodId: params.id, status: 'NO_FOR_PAYMENT' },
        select: { staffId: true, reason: true },
      }),
    ])

    const reasonMap = new Map<string, string | null>(
      validations.map((v: any) => [v.staffId as string, v.reason as string | null])
    )
    const data = buildWithheldReport(payrolls, reasonMap)

    if (format === 'json') return withCors(ApiResponse.success(data), origin)

    const period = await (prisma as any).phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { periodName: true, company: { select: { companyName: true } } },
    })
    const periodName  = period?.periodName ?? 'Unknown'
    const companyName = period?.company?.companyName ?? ''
    const safeName    = periodName.replace(/\s+/g, '-')

    if (format === 'xlsx') {
      const buf = await exportReportToExcel('Withheld Salaries', periodName, WITHHELD_COLS, data, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="withheld-${safeName}.xlsx"`,
          'Access-Control-Allow-Origin': origin ?? '*',
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
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

