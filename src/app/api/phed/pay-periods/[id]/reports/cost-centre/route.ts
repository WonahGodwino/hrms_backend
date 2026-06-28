import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'
import { buildCostCentreSummary } from '@/app/lib/phed/reports'
import { exportReportToExcel, exportReportToPdf, COST_CENTRE_COLS } from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/cost-centre?format=json|xlsx|pdf
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'COST_CENTRE_REPORT')

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { companyId: true, periodName: true, company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const payrolls = await (prisma as any).phedComputedPayroll.findMany({
      where: { payPeriodId: params.id },
    })
    const data = buildCostCentreSummary(payrolls)

    if (format === 'json') return withCors(ApiResponse.success(data), origin)

    const periodName  = period.periodName
    const companyName = period.company?.companyName ?? ''
    const safeName    = periodName.replace(/\s+/g, '-')

    if (format === 'xlsx') {
      const buf = await exportReportToExcel('Cost Centre Summary', periodName, COST_CENTRE_COLS, data, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="cost-centre-${safeName}.xlsx"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    if (format === 'pdf') {
      const buf = await exportReportToPdf('Cost Centre Summary', periodName, COST_CENTRE_COLS, data, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="cost-centre-${safeName}.pdf"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

