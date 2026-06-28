import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requirePhedReadAccess } from '@/app/lib/phed/access-role'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import {
  exportReportToExcel, exportReportToPdf, ReportColDef,
  INDIV_COLS_INFO, INDIV_COL_BASIC, INDIV_ALLOWANCE_FIELDS,
  INDIV_COL_OVERTIME, INDIV_COL_GROSS, INDIV_COL_GROSS_EX_OT,
  INDIV_COL_NET_SALARY, INDIV_COL_STATUS,
  INDIV_COLS_DEDUCTIONS, INDIV_COL_TOTAL_DEDUCTIONS,
  INDIV_COLS_POST_NET, INDIV_COLS_BANKING, INDIV_COLS_TAX,
} from '@/app/lib/phed/report-export'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/phed/pay-periods/:id/employees
// Individual payroll summary for all employees in a computed period.
//
// Query params:
//   format=json|xlsx|pdf  (default: json)
//   search                full-text on name / staff ID / department
//   category=REGULAR|CONTRACT
//   paymentStatus=ACTIVE|WITHHELD
//   page, limit           pagination (json only; xlsx/pdf always returns full list)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'report')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requirePhedReadAccess(token)

    const p             = new URL(req.url).searchParams
    const format        = p.get('format')        ?? 'json'
    const search        = p.get('search')        ?? ''
    const category      = p.get('category')      ?? ''
    const paymentStatus = p.get('paymentStatus') ?? ''
    const page          = Math.max(1, Number(p.get('page')  ?? 1))
    const limit         = Math.min(200, Math.max(1, Number(p.get('limit') ?? 50)))

    const period = await (prisma as any).phedPayPeriod.findUnique({
      where:  { id: params.id },
      select: { id: true, periodName: true, companyId: true, status: true,
                company: { select: { companyName: true } } },
    })

    if (!period)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)

    const where: any = { payPeriodId: params.id }
    if (category)      where.category      = category
    if (paymentStatus) where.paymentStatus = paymentStatus
    if (search) {
      where.OR = [
        { staffName:   { contains: search, mode: 'insensitive' } },
        { staffIdCode: { contains: search, mode: 'insensitive' } },
        { department:  { contains: search, mode: 'insensitive' } },
      ]
    }

    // ── JSON (paginated) ──────────────────────────────────────
    if (format === 'json') {
      const [total, records] = await Promise.all([
        (prisma as any).phedComputedPayroll.count({ where }),
        (prisma as any).phedComputedPayroll.findMany({
          where,
          orderBy: { staffName: 'asc' },
          skip:    (page - 1) * limit,
          take:    limit,
        }),
      ])

      return withCors(
        ApiResponse.success({
          period: { id: period.id, periodName: period.periodName, status: period.status },
          total,
          page,
          limit,
          pages:     Math.ceil(total / limit),
          employees: records.map((r: any, i: number) => ({
            sn:     (page - 1) * limit + i + 1,
            staffId: r.staffId,   // DB CUID — pass to /employees/:staffId for PDF
            ...buildEmployeeDetail(r),
          })),
        }),
        origin
      )
    }

    // ── xlsx / pdf — full list, no pagination ─────────────────
    const allRecords = await (prisma as any).phedComputedPayroll.findMany({
      where,
      orderBy: { staffName: 'asc' },
    })

    const periodName  = period.periodName
    const companyName = period.company?.companyName ?? ''
    const safeName    = periodName.replace(/\s+/g, '-')

    // Load dynamic entity data for union / cooperative / deduction breakdowns
    const staffIds = allRecords.map((r: any) => r.staffId)
    const [allUnions, allCoops, allDeductions, staffUnions, staffCoops, staffDeductions] = await Promise.all([
      (prisma as any).phedUnion.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedCooperative.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedDeductionLiability.findMany({ where: { companyId: period.companyId, isActive: true }, orderBy: { name: 'asc' } }),
      (prisma as any).phedStaffUnion.findMany({ where: { staffId: { in: staffIds } } }),
      (prisma as any).phedStaffCooperative.findMany({ where: { staffId: { in: staffIds } } }),
      (prisma as any).phedStaffDeductionLiability.findMany({ where: { staffId: { in: staffIds } } }),
    ])

    // Build membership/amount lookup maps keyed by staffId
    const unionMemberMap  = new Map<string, Set<string>>()
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
    staffDeductions.forEach((sd: any) => {
      if (!deductAmountMap.has(sd.staffId)) deductAmountMap.set(sd.staffId, new Map())
      deductAmountMap.get(sd.staffId)!.set(sd.deductionLiabilityId, Number(sd.amount))
    })

    // Build dynamic ReportColDef arrays
    const unionCols:  ReportColDef[] = allUnions.map((u: any)    => ({ header: `${u.name} Union (₦)`, key: `u_${u.id}`, excelWidth: 20, pdfRatio: 1.05, type: 'currency' as const }))
    const coopCols:   ReportColDef[] = allCoops.map((c: any)     => ({ header: `${c.name} Coop (₦)`,  key: `c_${c.id}`, excelWidth: 20, pdfRatio: 1.05, type: 'currency' as const }))
    const deductCols: ReportColDef[] = allDeductions.map((d: any) => ({ header: `${d.name} (₦)`,      key: `d_${d.id}`, excelWidth: 20, pdfRatio: 1.05, type: 'currency' as const }))

    // Allowance cols — include only if at least one employee has a non-zero value
    const allowanceCols: ReportColDef[] = INDIV_ALLOWANCE_FIELDS
      .filter(f => allRecords.some((r: any) => n(r[f.key]) !== 0))
      .map(f => ({ header: f.header, key: f.key, excelWidth: f.excelWidth, pdfRatio: f.pdfRatio, type: 'currency' as const }))

    // Column order: info | gross (ex-OT) | basic | allowances | overtime | total gross | net | status |
    //   pension EE | PAYE | union | coop | deduction liabilities | total deductions |
    //   pension ER | NHF | ITF | NSITF | banking | tax
    const finalCols: ReportColDef[] = [
      ...INDIV_COLS_INFO,
      INDIV_COL_GROSS_EX_OT,  // Gross = Basic + allowances (no overtime)
      INDIV_COL_BASIC,
      ...allowanceCols,
      INDIV_COL_OVERTIME,
      INDIV_COL_GROSS,         // Total Gross = grossSalary (Basic + allowances + overtime)
      INDIV_COL_NET_SALARY,
      INDIV_COL_STATUS,
      ...INDIV_COLS_DEDUCTIONS,
      ...unionCols,
      ...coopCols,
      ...deductCols,
      INDIV_COL_TOTAL_DEDUCTIONS,
      ...INDIV_COLS_POST_NET,
      ...INDIV_COLS_BANKING,
      ...INDIV_COLS_TAX,
    ]

    const rows = allRecords.map((r: any, i: number) => ({
      sn: i + 1,
      ...mapRecord(r, allUnions, unionMemberMap, allCoops, coopAmountMap, allDeductions, deductAmountMap),
    }))

    if (format === 'xlsx') {
      const buf = await exportReportToExcel(
        'Individual Payroll Summary', periodName, finalCols, rows, companyName
      )
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="individual-summary-${safeName}.xlsx"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    if (format === 'pdf') {
      const buf = await exportReportToPdf(
        'Individual Payroll Summary', periodName, finalCols, rows, companyName
      )
      return new NextResponse(buf as any, {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="individual-summary-${safeName}.pdf"`,
          'Access-Control-Allow-Origin': origin ?? '*',
        },
      })
    }

    return withCors(ApiResponse.error('Invalid format. Use json, xlsx, or pdf', 400), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// ── Helpers ───────────────────────────────────────────────────

function n(v: any): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v) || 0
}

// Full structured breakdown per employee — matches /employees/:staffId JSON shape.
// Used by the JSON list response so the FE gets all detail in one call.
function buildEmployeeDetail(r: any) {
  return {
    employee: {
      staffIdCode: r.staffIdCode ?? '',
      staffName:   r.staffName   ?? '',
      staffEmail:  r.staffEmail  ?? '',
      category:    r.category    ?? '',
      gradeName:   r.gradeName   ?? '',
      department:  r.department  ?? '',
      unit:        r.unit        ?? '',
      regionName:  r.regionName  ?? '',
    },
    earnings: {
      basicSalary:          n(r.basicSalary),
      housingAllowance:     n(r.housingAllowance),
      transportAllowance:   n(r.transportAllowance),
      furnitureAllowance:   n(r.furnitureAllowance),
      mealSubsidy:          n(r.mealSubsidy),
      utilityAllowance:     n(r.utilityAllowance),
      leaveAllowance:       n(r.leaveAllowance),
      shiftAllowance:       n(r.shiftAllowance),
      otherAllowances:      n(r.otherAllowances),
      overtimeEarnings:     n(r.overtimeEarnings),
      grossSalary:          n(r.grossSalary),
    },
    deductions: {
      pensionEmployee:       n(r.pensionEmployee),
      pensionEmployer:       n(r.pensionEmployer),
      nhf:                   n(r.nhf),
      monthlyPAYE:           n(r.monthlyPAYE),
      unionDeductions:       n(r.unionDeductions),
      cooperativeDeductions: n(r.cooperativeDeductions),
      otherDeductions:       n(r.otherDeductions),
      totalDeductions:       n(r.totalDeductions),
    },
    tax: {
      annualGrossIncome:      n(r.annualGrossIncome),
      annualRentRelief:       n(r.annualRentRelief),
      annualPensionDeduction: n(r.annualPensionDeduction),
      annualChargeableIncome: n(r.annualChargeableIncome),
      annualPAYE:             n(r.annualPAYE),
      monthlyPAYE:            n(r.monthlyPAYE),
    },
    netSalary: n(r.netSalary),
    status: {
      validationStatus: r.validationStatus ?? '',
      paymentStatus:    r.paymentStatus    ?? '',
      withheldReason:   r.withheldReason   ?? null,
    },
    banking: {
      bankName:      r.bankName      ?? '',
      accountNumber: r.accountNumber ?? '',
      accountName:   r.accountName   ?? '',
      pfaName:       r.pfaName       ?? '',
      rsaPin:        r.rsaPin        ?? '',
    },
  }
}

// Flat record used only for xlsx/pdf column mapping
function mapRecord(
  r: any,
  allUnions:       any[],
  unionMemberMap:  Map<string, Set<string>>,
  allCoops:        any[],
  coopAmountMap:   Map<string, Map<string, number>>,
  allDeductions:   any[],
  deductAmountMap: Map<string, Map<string, number>>,
) {
  const memberUnions   = unionMemberMap.get(r.staffId)  ?? new Set<string>()
  const staffCoopMap   = coopAmountMap.get(r.staffId)   ?? new Map<string, number>()
  const staffDeductMap = deductAmountMap.get(r.staffId) ?? new Map<string, number>()
  const grossSalary    = n(r.grossSalary)

  const dynamicUnions = Object.fromEntries(
    allUnions.map((u: any) => [
      `u_${u.id}`,
      memberUnions.has(u.id) ? r2(grossSalary * Number(u.percentage)) : 0,
    ])
  )
  const dynamicCoops = Object.fromEntries(
    allCoops.map((c: any) => [`c_${c.id}`, r2(staffCoopMap.get(c.id) ?? 0)])
  )
  const dynamicDeductions = Object.fromEntries(
    allDeductions.map((d: any) => [`d_${d.id}`, r2(staffDeductMap.get(d.id) ?? 0)])
  )

  return {
    // Employee info
    staffIdCode:  r.staffIdCode ?? '',
    staffName:    r.staffName   ?? '',
    category:     r.category    ?? '',
    gradeName:    r.gradeName   ?? '',
    department:   r.department  ?? '',

    // Allowances (all values provided; finalCols only includes non-zero-across-period ones)
    housingAllowance:       n(r.housingAllowance),
    transportAllowance:     n(r.transportAllowance),
    furnitureAllowance:     n(r.furnitureAllowance),
    mealSubsidy:            n(r.mealSubsidy),
    utilityAllowance:       n(r.utilityAllowance),
    leaveAllowance:         n(r.leaveAllowance),
    shiftAllowance:         n(r.shiftAllowance),
    domesticAllowance:      n(r.domesticAllowance),
    hazardAllowance:        n(r.hazardAllowance),
    electricityAllowance:   n(r.electricityAllowance),
    discoveryAllowance:     n(r.discoveryAllowance),
    carSubsidy:             n(r.carSubsidy),
    entertainmentAllowance: n(r.entertainmentAllowance),
    dataAllowance:          n(r.dataAllowance),
    nightAllowance:         n(r.nightAllowance),
    arrears:                n(r.arrears),
    otherAllowances:        n(r.otherAllowances),

    // Earnings totals
    basicSalary:      n(r.basicSalary),
    grossExOvertime:  r2(grossSalary - n(r.overtimeEarnings)),
    grossSalary,
    overtimeEarnings: n(r.overtimeEarnings),

    // Deductions that reduce net
    pensionEmployee: n(r.pensionEmployee),
    monthlyPAYE:     n(r.monthlyPAYE),
    ...dynamicUnions,
    ...dynamicCoops,
    ...dynamicDeductions,
    totalDeductions: n(r.totalDeductions),
    netSalary:       n(r.netSalary),
    paymentStatus:   r.paymentStatus ?? '',

    // Post-net statutory items (don't reduce employee net)
    pensionEmployer: n(r.pensionEmployer),
    nhf:             n(r.nhf),
    itf:             r2(grossSalary * 0.01),
    nsitf:           r2(grossSalary * 0.01),

    // Banking
    bankName:      r.bankName      ?? '',
    accountNumber: r.accountNumber ?? '',
    accountName:   r.accountName   ?? '',
    pfaName:       r.pfaName       ?? '',
    rsaPin:        r.rsaPin        ?? '',

    // Tax computation
    annualGrossIncome:      n(r.annualGrossIncome),
    annualRentRelief:       n(r.annualRentRelief),
    annualPensionDeduction: n(r.annualPensionDeduction),
    annualChargeableIncome: n(r.annualChargeableIncome),
    annualPAYE:             n(r.annualPAYE),
  }
}

function r2(v: number): number { return Math.round(v * 100) / 100 }
