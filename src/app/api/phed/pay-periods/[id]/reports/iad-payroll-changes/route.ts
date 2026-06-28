import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { requirePhedPageAccess } from '@/app/lib/phed/access-role'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof (v as any).toNumber === 'function') return (v as any).toNumber()
  return Number(v) || 0
}

function r2(v: number): number {
  return Math.round(v * 100) / 100
}

const CATEGORIES = [
  { key: 'REGULAR', label: 'Regular Staff' },
  { key: 'CONTRACT', label: 'Contract Staff' },
  { key: 'NYSC_IT', label: 'NYSC/Internship' },
] as const

type PayrollRow = { category: string | null; grossSalary: unknown; totalDeductions: unknown; netSalary: unknown }
type SummaryRow = { label: string; gross: number; deduction: number; netPay: number }

function aggregateByCategory(payrolls: PayrollRow[]): SummaryRow[] {
  const rows: SummaryRow[] = CATEGORIES.map(({ key, label }) => {
    const subset = payrolls.filter(p => p.category === key)
    const gross = r2(subset.reduce((s, p) => s + toNum(p.grossSalary), 0))
    const deduction = r2(subset.reduce((s, p) => s + toNum(p.totalDeductions), 0))
    const netPay = r2(subset.reduce((s, p) => s + toNum(p.netSalary), 0))
    return { label, gross, deduction, netPay }
  })

  const totalGross = r2(rows.reduce((s, r) => s + r.gross, 0))
  const totalDeduction = r2(rows.reduce((s, r) => s + r.deduction, 0))
  const totalNet = r2(rows.reduce((s, r) => s + r.netPay, 0))
  rows.push({ label: 'Total', gross: totalGross, deduction: totalDeduction, netPay: totalNet })

  return rows
}

function diffRows(prev: SummaryRow[], curr: SummaryRow[]): SummaryRow[] {
  return curr.map((c, i) => ({
    label: c.label,
    gross: r2(c.gross - (prev[i]?.gross ?? 0)),
    deduction: r2(c.deduction - (prev[i]?.deduction ?? 0)),
    netPay: r2(c.netPay - (prev[i]?.netPay ?? 0)),
  }))
}

// GET /api/phed/pay-periods/:id/reports/iad-payroll-changes — IAD Page, 5th
// tab. Compares the current period's payroll summary against the previous
// period's, returning three tables (previousMonth, currentMonth, changes)
// in the same category × metric format as IAD Summary's Section A.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requirePhedPageAccess(token, 'IAD_SUMMARY')

    const period = await prisma.phedPayPeriod.findUnique({
      where: { id: params.id },
      select: { companyId: true, year: true, month: true, periodName: true },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && period.companyId !== user.companyId) {
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    }

    const previousPeriod = await prisma.phedPayPeriod.findFirst({
      where: {
        companyId: period.companyId,
        OR: [
          { year: { lt: period.year } },
          { year: period.year, month: { lt: period.month } },
        ],
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: { id: true, periodName: true },
    })

    const payrollSelect = {
      category: true,
      grossSalary: true,
      totalDeductions: true,
      netSalary: true,
    } as const

    const [currentPayrolls, previousPayrolls] = await Promise.all([
      prisma.phedComputedPayroll.findMany({ where: { payPeriodId: params.id }, select: payrollSelect }),
      previousPeriod
        ? prisma.phedComputedPayroll.findMany({ where: { payPeriodId: previousPeriod.id }, select: payrollSelect })
        : Promise.resolve([]),
    ])

    const currentMonth = aggregateByCategory(currentPayrolls)
    const previousMonth = aggregateByCategory(previousPayrolls)
    const changes = diffRows(previousMonth, currentMonth)

    return withCors(
      ApiResponse.success({
        currentPeriodName: period.periodName,
        previousPeriodName: previousPeriod?.periodName ?? null,
        hasPreviousPeriod: !!previousPeriod,
        previousMonth,
        currentMonth,
        changes,
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
