import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import {
  exportPeriodSummaryToExcel,
  exportPeriodSummaryToPdf,
  type PeriodSummaryData,
} from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/summary?format=json|xlsx|pdf
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'read')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requirePhedReadAccess(token)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const [period, payrolls, validationCounts] = await Promise.all([
      (prisma as any).phedPayPeriod.findUnique({
        where:  { id: params.id },
        include: { company: { select: { companyName: true } } },
      }),
      (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: params.id } }),
      (prisma as any).phedValidation.groupBy({
        by: ['status'],
        where: { payPeriodId: params.id },
        _count: { status: true },
      }),
    ])

    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    const n = (v: any): number => {
      if (v === null || v === undefined) return 0
      if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
      return Number(v) || 0
    }

    const active   = payrolls.filter((p: any) => p.paymentStatus === 'ACTIVE')
    const withheld = payrolls.filter((p: any) => p.paymentStatus === 'WITHHELD')

    const summary: PeriodSummaryData = {
      period,
      headCount:     payrolls.length,
      activeCount:   active.length,
      withheldCount: withheld.length,
      earnings: {
        totalBasic:    r2(payrolls.reduce((s: number, p: any) => s + n(p.basicSalary), 0)),
        totalGross:    r2(payrolls.reduce((s: number, p: any) => s + n(p.grossSalary), 0)),
        totalOvertime: r2(payrolls.reduce((s: number, p: any) => s + n(p.overtimeEarnings), 0)),
        activeGross:   r2(active.reduce((s: number, p: any) => s + n(p.grossSalary), 0)),
      },
      deductions: {
        totalPAYE:        r2(payrolls.reduce((s: number, p: any) => s + n(p.monthlyPAYE), 0)),
        totalPensionEE:   r2(payrolls.reduce((s: number, p: any) => s + n(p.pensionEmployee), 0)),
        totalPensionER:   r2(payrolls.reduce((s: number, p: any) => s + n(p.pensionEmployer), 0)),
        totalNHF:         r2(payrolls.reduce((s: number, p: any) => s + n(p.nhf), 0)),
        totalUnion:       r2(payrolls.reduce((s: number, p: any) => s + n(p.unionDeductions), 0)),
        totalCooperative: r2(payrolls.reduce((s: number, p: any) => s + n(p.cooperativeDeductions), 0)),
        totalDeductions:  r2(payrolls.reduce((s: number, p: any) => s + n(p.totalDeductions), 0)),
      },
      net: {
        totalNet:      r2(payrolls.reduce((s: number, p: any) => s + n(p.netSalary), 0)),
        activeNet:     r2(active.reduce((s: number, p: any) => s + n(p.netSalary), 0)),
        withheldGross: r2(withheld.reduce((s: number, p: any) => s + n(p.grossSalary), 0)),
      },
      statutory: {
        itf:   r2(active.reduce((s: number, p: any) => s + n(p.grossSalary) * 0.01, 0)),
        nsitf: r2(active.reduce((s: number, p: any) => s + n(p.grossSalary) * 0.01, 0)),
      },
      validationSummary: Object.fromEntries(
        validationCounts.map((vc: any) => [vc.status, vc._count.status])
      ),
    }

    if (format === 'json') return withCors(ApiResponse.success(summary), origin)

    const companyName = period.company?.companyName ?? ''
    const safeName    = (period.periodName as string).replace(/\s+/g, '-')

    if (format === 'xlsx') {
      const buf = await exportPeriodSummaryToExcel(summary, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="period-summary-${safeName}.xlsx"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    if (format === 'pdf') {
      const buf = await exportPeriodSummaryToPdf(summary, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="period-summary-${safeName}.pdf"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

function r2(v: number) { return Math.round(v * 100) / 100 }
