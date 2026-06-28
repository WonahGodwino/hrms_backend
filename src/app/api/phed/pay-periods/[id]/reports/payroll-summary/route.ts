import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { buildPayrollSummary } from '@/app/lib/phed/reports'
import {
  exportPayrollSummaryToPdf,
  exportIADSummaryToExcel,
  exportIADSummaryToPdf,
  IADEmployee,
  IADSummaryInput,
} from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/reports/payroll-summary?format=json|xlsx|pdf
//
// json → { summary, newlyHiredRegular, newlyHiredContract, exitedRegular, metadata }
// xlsx → 4-sheet workbook:
//   Sheet 1: IAD Summary (category breakdown: Regular / Contract / NYSC)
//   Sheet 2: Newly Hired (Regular)
//   Sheet 3: Newly Hired (Contract)
//   Sheet 4: Exited (Regular)
// pdf  → category summary + 3 IAD classification sections
//
// "Newly hired" = staff who have NO computed payroll in any earlier period for this company.
// "Exited"      = staff marked isActive=false in phed_staff.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requirePhedReadAccess(token)

    const rl = phedRateLimit(req, 'report')
    if (rl) return withCors(rl, origin)

    const format = new URL(req.url).searchParams.get('format') ?? 'json'

    const period = await (prisma as any).phedPayPeriod.findUnique({
      where:  { id: params.id },
      select: { id: true, periodName: true, month: true, year: true, companyId: true,
                company: { select: { companyName: true } } },
    })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)

    const companyName = period.company?.companyName ?? ''
    const safeName    = (period.periodName as string).replace(/\s+/g, '-')

    // ── Fetch current period payrolls ─────────────────────────
    const currentPayrolls = await (prisma as any).phedComputedPayroll.findMany({
      where: { payPeriodId: params.id },
    })

    // ── Category summary (backward-compat + Sheet 1) ──────────
    const summary = buildPayrollSummary(currentPayrolls, period.periodName, period.month, period.year)

    // ── Determine new-hire status (no payroll in any prior period) ──
    const prevPeriods = await (prisma as any).phedPayPeriod.findMany({
      where:  { companyId: period.companyId, id: { not: params.id } },
      select: { id: true },
    })
    const prevStaffIds = new Set<string>()
    if (prevPeriods.length > 0) {
      const prevPayrolls = await (prisma as any).phedComputedPayroll.findMany({
        where:  { payPeriodId: { in: prevPeriods.map((p: any) => p.id) } },
        select: { staffId: true },
      })
      prevPayrolls.forEach((p: any) => prevStaffIds.add(p.staffId))
    }

    // ── Active/inactive status ────────────────────────────────
    const staffIds = currentPayrolls.map((r: any) => r.staffId)
    const staffRecords = await (prisma as any).phedStaff.findMany({
      where:  { id: { in: staffIds } },
      select: { id: true, isActive: true },
    })
    const staffActiveMap = new Map<string, boolean>(
      staffRecords.map((s: any) => [s.id, s.isActive] as [string, boolean])
    )

    // ── Dynamic entity data ───────────────────────────────────
    const [allUnions, allCoops, allDeductions, staffUnions, staffCoops, staffDedLiabilities] =
      await Promise.all([
        (prisma as any).phedUnion.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
        (prisma as any).phedCooperative.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
        (prisma as any).phedDeductionLiability.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
        (prisma as any).phedStaffUnion.findMany({ where: { staffId: { in: staffIds } } }),
        (prisma as any).phedStaffCooperative.findMany({ where: { staffId: { in: staffIds } } }),
        (prisma as any).phedStaffDeductionLiability.findMany({ where: { staffId: { in: staffIds } } }),
      ])

    // ── Lookup maps ───────────────────────────────────────────
    const unionMemberMap = new Map<string, Set<string>>()
    staffUnions.forEach((su: any) => {
      if (!unionMemberMap.has(su.staffId)) unionMemberMap.set(su.staffId, new Set())
      unionMemberMap.get(su.staffId)!.add(su.unionId)
    })
    const coopAmountMap = new Map<string, Map<string, number>>()
    staffCoops.forEach((sc: any) => {
      if (!coopAmountMap.has(sc.staffId)) coopAmountMap.set(sc.staffId, new Map())
      coopAmountMap.get(sc.staffId)!.set(sc.cooperativeId, Number(sc.totalAmount))
    })
    const deductAmountMap = new Map<string, Map<string, number>>()
    staffDedLiabilities.forEach((sd: any) => {
      if (!deductAmountMap.has(sd.staffId)) deductAmountMap.set(sd.staffId, new Map())
      deductAmountMap.get(sd.staffId)!.set(sd.deductionLiabilityId, Number(sd.amount))
    })

    // ── Map computed payroll record → IADEmployee ─────────────
    function toIAD(r: any): IADEmployee {
      const gross          = n(r.grossSalary)
      const pensionER      = n(r.pensionEmployer)
      const annualGross    = n(r.annualGrossIncome)
      const annualCharge   = n(r.annualChargeableIncome)
      const memberUnions   = unionMemberMap.get(r.staffId)  ?? new Set<string>()
      const staffCoopMap   = coopAmountMap.get(r.staffId)   ?? new Map<string, number>()
      const staffDeductMap = deductAmountMap.get(r.staffId) ?? new Map<string, number>()

      return {
        staffIdCode:             r.staffIdCode ?? '',
        staffName:               r.staffName   ?? '',
        gradeName:               r.gradeName   ?? '',
        grossSalary:             gross,
        housingAllowance:        n(r.housingAllowance),
        transportAllowance:      n(r.transportAllowance),
        furnitureAllowance:      n(r.furnitureAllowance),
        mealSubsidy:             n(r.mealSubsidy),
        utilityAllowance:        n(r.utilityAllowance),
        leaveAllowance:          n(r.leaveAllowance),
        shiftAllowance:          n(r.shiftAllowance),
        domesticAllowance:       n(r.domesticAllowance),
        hazardAllowance:         n(r.hazardAllowance),
        electricityAllowance:    n(r.electricityAllowance),
        discoveryAllowance:      n(r.discoveryAllowance),
        carSubsidy:              n(r.carSubsidy),
        entertainmentAllowance:  n(r.entertainmentAllowance),
        dataAllowance:           n(r.dataAllowance),
        nightAllowance:          n(r.nightAllowance),
        arrears:                 n(r.arrears),
        otherAllowances:         n(r.otherAllowances),
        lifeAssuranceAmount:     n(r.lifeAssuranceAmount),
        pensionEmployee:         n(r.pensionEmployee),
        monthlyPAYE:             n(r.monthlyPAYE),
        totalDeductions:         n(r.totalDeductions),
        netSalary:               n(r.netSalary),
        pensionEmployer:         pensionER,
        salaryCost:              r2(gross + pensionER + gross * 0.02),
        annualRentRelief:        n(r.annualRentRelief),
        totalAllowableDeduction: r2(annualGross - annualCharge),
        annualChargeableIncome:  annualCharge,
        annualPAYE:              n(r.annualPAYE),
        ...Object.fromEntries(
          allUnions.map((u: any) => [
            `u_${u.id}`,
            memberUnions.has(u.id) ? r2(gross * Number(u.percentage)) : 0,
          ])
        ),
        ...Object.fromEntries(
          allCoops.map((c: any) => [`c_${c.id}`, r2(staffCoopMap.get(c.id) ?? 0)])
        ),
        ...Object.fromEntries(
          allDeductions.map((d: any) => [`d_${d.id}`, r2(staffDeductMap.get(d.id) ?? 0)])
        ),
      }
    }

    // ── Classify employees ────────────────────────────────────
    const newlyHiredRegular:  IADEmployee[] = []
    const newlyHiredContract: IADEmployee[] = []
    const exitedRegular:      IADEmployee[] = []
    const exitedContract:     IADEmployee[] = []

    currentPayrolls.forEach((r: any) => {
      const emp      = toIAD(r)
      const isNew    = !prevStaffIds.has(r.staffId)
      const isExited = staffActiveMap.get(r.staffId) === false

      if (isExited && r.category === 'REGULAR') {
        exitedRegular.push(emp)
      } else if (isExited && (r.category === 'CONTRACT' || r.category === 'NYSC_IT')) {
        exitedContract.push(emp)
      } else if (isNew && r.category === 'REGULAR') {
        newlyHiredRegular.push(emp)
      } else if (isNew && r.category === 'CONTRACT') {
        newlyHiredContract.push(emp)
      }
    })

    // ── Previous period summary for Changes sheet (Sheet 5) ──
    const immediatePrevPeriod = await (prisma as any).phedPayPeriod.findFirst({
      where: {
        companyId: period.companyId,
        computedPayrolls: { some: {} },
        OR: [
          { year: { lt: period.year } },
          { year: period.year, month: { lt: period.month } },
        ],
      },
      select: { id: true, periodName: true, month: true, year: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })
    const prevSummaryPayrolls = immediatePrevPeriod
      ? await (prisma as any).phedComputedPayroll.findMany({ where: { payPeriodId: immediatePrevPeriod.id } })
      : []
    const previousSummary = immediatePrevPeriod
      ? buildPayrollSummary(prevSummaryPayrolls, immediatePrevPeriod.periodName, immediatePrevPeriod.month, immediatePrevPeriod.year)
      : null
    const varianceRows = previousSummary
      ? summary.rows.map((c: any) => {
          const p = previousSummary.rows.find((r: any) => r.label === c.label)
          return {
            label:                 c.label,
            headCountDelta:        c.headCount        - (p?.headCount        ?? 0),
            grossPayDelta:         r2(c.grossPay         - (p?.grossPay         ?? 0)),
            totalPayrollCostDelta: r2(c.totalPayrollCost - (p?.totalPayrollCost ?? 0)),
          }
        })
      : null

    const iadData: IADSummaryInput = {
      periodName:      period.periodName,
      summary,
      previousSummary,
      varianceRows,
      newlyHiredRegular,
      newlyHiredContract,
      exitedRegular,
      exitedContract,
      unions:       allUnions.map((u: any) => ({ id: u.id, name: u.name })),
      cooperatives: allCoops.map((c: any) => ({ id: c.id, name: c.name })),
      deductions:   allDeductions.map((d: any) => ({ id: d.id, name: d.name })),
    }

    // ── JSON ──────────────────────────────────────────────────
    if (format === 'json') {
      return withCors(ApiResponse.success({
        summary,
        newlyHiredRegular,
        newlyHiredContract,
        exitedRegular,
        metadata: {
          unions:       iadData.unions,
          cooperatives: iadData.cooperatives,
          deductions:   iadData.deductions,
        },
      }), origin)
    }

    // ── PDF ───────────────────────────────────────────────────
    if (format === 'pdf') {
      const buf = await exportIADSummaryToPdf(iadData, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="iad-summary-${safeName}.pdf"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    // ── XLSX ──────────────────────────────────────────────────
    if (format === 'xlsx') {
      const buf = await exportIADSummaryToExcel(iadData, companyName)
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="iad-summary-${safeName}.xlsx"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

function n(v: any): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v) || 0
}

function r2(v: number): number { return Math.round(v * 100) / 100 }
