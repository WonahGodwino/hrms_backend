import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { processOneStaff } from '@/app/lib/phed/payroll-processor'
import type { PhedPayrollInput, PhedSalaryComponents } from '@/app/lib/phed/types'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/compute
// Runs the full payroll engine for all staff in this period.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'compute')
  if (rl) return withCors(rl, origin)
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user  = await requireModuleAccess(token, 'PHED', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const period = await (prisma as any).phedPayPeriod.findUnique({ where: { id: params.id } })
    if (!period) return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (user.role !== 'SUPER_ADMIN' && user.companyId && period.companyId !== user.companyId)
      return withCors(ApiResponse.notFound('Pay period not found'), origin)
    if (!['VALIDATION_CLOSED', 'REVIEW'].includes(period.status))
      return withCors(ApiResponse.error('Period must be in VALIDATION_CLOSED or REVIEW status to compute', 400), origin)

    // ── Load all data needed for computation ──────────────────

    const [allStaff, validations, overtimeEntries] = await Promise.all([
      (prisma as any).phedStaff.findMany({
        where: { companyId: period.companyId, isActive: true },
        include: {
          grade: { include: { allowanceTemplates: true } },
          region: true,
          unions:               { include: { union: true } },
          cooperatives:         { include: { cooperative: true } },
          deductionLiabilities: { include: { deductionLiability: true } },
        },
      }),
      (prisma as any).phedValidation.findMany({
        where: { payPeriodId: params.id },
      }),
      (prisma as any).phedOvertimeEntry.findMany({
        where: { payPeriodId: params.id },
      }),
    ])

    const validationMap       = new Map(validations.map((v: any) => [v.staffId, v.status]))
    const validationReasonMap = new Map(validations.map((v: any) => [v.staffId, v.reason as string | null]))
    const overtimeMap         = new Map(overtimeEntries.map((ot: any) => [ot.staffId, Number(ot.overtimeHours)]))

    const results = []

    for (const staff of allStaff) {
      // ── Resolve salary components ────────────────────────────
      const salary = resolveSalary(staff)

      // ── Union deductions (sum of percentages, applied to gross in processor) ──
      const unionDeductionTotal = staff.unions.reduce(
        (sum: number, su: any) => sum + Number(su.union.percentage),
        0
      )

      // ── Cooperative deductions (sum of per-member fixed totalAmount) ────────────
      const cooperativeDeductionTotal = staff.cooperatives.reduce(
        (sum: number, sc: any) => sum + Number(sc.totalAmount ?? 0),
        0
      )

      // ── Deduction/Liability deductions (sum of per-member fixed amount) ─────────
      const deductionLiabilityTotal = staff.deductionLiabilities.reduce(
        (sum: number, sd: any) => sum + (sd.deductionLiability?.isActive ? Number(sd.amount ?? 0) : 0),
        0
      )

      const input: PhedPayrollInput = {
        staffId:      staff.id,
        staffDbId:    staff.id,
        staffName:    `${staff.firstName} ${staff.lastName}`,
        staffEmail:   staff.email,
        staffIdCode:  staff.staffId,
        category:     staff.category,
        gradeName:    staff.grade?.name ?? '',
        department:   staff.department  ?? '',
        unit:         staff.unit        ?? '',
        regionName:   staff.region?.name ?? '',
        salary,
        annualRent:           Number(staff.annualRent ?? 0),
        hasLifeAssurance:     Boolean(staff.hasLifeAssurance),
        lifeAssuranceAmount:  Number(staff.lifeAssuranceAmount ?? 0),
        overtimeHours: Number(overtimeMap.get(staff.id) ?? 0),
        unionDeductionTotal,
        cooperativeDeductionTotal,
        deductionLiabilityTotal,
        validationStatus: (validationMap.get(staff.id) as any) ?? 'PENDING',
        withheldReason:   (validationReasonMap.get(staff.id) as string | undefined) ?? undefined,
        bankName:      staff.bankName      ?? '',
        accountNumber: staff.accountNumber ?? '',
        accountName:   staff.accountName   ?? '',
        pfaName:       staff.pfaName       ?? '',
        rsaPin:        staff.rsaPin        ?? '',
        pensionNumber: staff.pensionNumber ?? undefined,
        tin:           staff.tin           ?? undefined,
      }

      const result = processOneStaff(input)
      results.push(result)
    }

    // ── Upsert computed payrolls ──────────────────────────────
    await Promise.all(
      results.map(r =>
        (prisma as any).phedComputedPayroll.upsert({
          where: { payPeriodId_staffId: { payPeriodId: params.id, staffId: r.staffId } },
          create: {
            payPeriodId:  params.id,
            staffId:      r.staffId,
            companyId:    period.companyId,
            staffName:    r.staffName,
            staffEmail:   r.staffEmail,
            staffIdCode:  r.staffIdCode,
            category:     r.category,
            gradeName:    r.gradeName,
            department:   r.department,
            unit:         r.unit,
            regionName:   r.regionName,
            ...payrollFields(r),
          },
          update: {
            staffName:    r.staffName,
            staffEmail:   r.staffEmail,
            staffIdCode:  r.staffIdCode,
            category:     r.category,
            gradeName:    r.gradeName,
            department:   r.department,
            unit:         r.unit,
            regionName:   r.regionName,
            ...payrollFields(r),
          },
        })
      )
    )

    // Update overtime entries with computed amounts
    await Promise.all(
      results
        .filter(r => r.overtimeEarnings > 0)
        .map(r =>
          (prisma as any).phedOvertimeEntry.updateMany({
            where: { payPeriodId: params.id, staffId: r.staffId },
            data:  { computedAmount: r.overtimeEarnings },
          })
        )
    )

    // Advance period to REVIEW
    const updatedPeriod = await (prisma as any).phedPayPeriod.update({
      where: { id: params.id },
      data:  { status: 'REVIEW' },
    })

    const summary = {
      totalStaff:    results.length,
      activeStaff:   results.filter(r => r.paymentStatus === 'ACTIVE').length,
      withheldStaff: results.filter(r => r.paymentStatus === 'WITHHELD').length,
      totalGross:    r2(results.reduce((s, r) => s + r.grossSalary, 0)),
      totalNet:      r2(results.reduce((s, r) => s + r.netSalary, 0)),
      totalPAYE:     r2(results.reduce((s, r) => s + r.monthlyPAYE, 0)),
      totalPension:  r2(results.reduce((s, r) => s + r.pensionEmployee + r.pensionEmployer, 0)),
    }

    return withCors(ApiResponse.success({ period: updatedPeriod, summary }, 'Payroll computed successfully'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// ── Helpers ───────────────────────────────────────────────────

function resolveSalary(staff: any): PhedSalaryComponents {
  const templates: Map<string, any> = new Map(
    (staff.grade?.allowanceTemplates ?? []).map((t: any) => [t.allowanceType, t])
  )

  // staff.basicSalary is the total monthly gross package.
  // Allowances are slices of that gross, not additions on top of it.
  const monthlyGross = Number(staff.basicSalary ?? staff.grade?.defaultBasicSalary ?? 0)

  function resolveAllowance(field: keyof PhedSalaryComponents, allowanceType: string): number {
    const override = staff[field]
    if (override !== null && override !== undefined) return Number(override)
    const template = templates.get(allowanceType)
    if (!template) return 0
    if (template.valueType === 'FIXED')      return Number(template.value)
    if (template.valueType === 'PERCENTAGE') return r2(monthlyGross * Number(template.value) / 100)
    return 0
  }

  const housingAllowance      = resolveAllowance('housingAllowance',      'HOUSING')
  const transportAllowance    = resolveAllowance('transportAllowance',    'TRANSPORT')
  const furnitureAllowance    = resolveAllowance('furnitureAllowance',    'FURNITURE')
  const mealSubsidy           = resolveAllowance('mealSubsidy',           'MEAL_SUBSIDY')
  const utilityAllowance      = resolveAllowance('utilityAllowance',      'UTILITY')
  const leaveAllowance        = resolveAllowance('leaveAllowance',        'LEAVE')
  const shiftAllowance        = resolveAllowance('shiftAllowance',        'SHIFT')
  const domesticAllowance     = resolveAllowance('domesticAllowance',     'DOMESTIC')
  const hazardAllowance       = resolveAllowance('hazardAllowance',       'HAZARD')
  const electricityAllowance  = resolveAllowance('electricityAllowance',  'ELECTRICITY')
  const discoveryAllowance    = resolveAllowance('discoveryAllowance',    'DISCOVERY')
  const carSubsidy            = resolveAllowance('carSubsidy',            'CAR_SUBSIDY')
  const entertainmentAllowance = resolveAllowance('entertainmentAllowance', 'ENTERTAINMENT')
  const dataAllowance         = resolveAllowance('dataAllowance',         'DATA')
  const nightAllowance        = resolveAllowance('nightAllowance',        'NIGHT')
  const arrears               = resolveAllowance('arrears',               'ARREARS')
  const otherAllowances       = Number(staff.otherAllowances ?? 0)

  // All allowances are slices of the total package — basicSalary is what remains.
  const totalAllowances = r2(
    housingAllowance + transportAllowance + furnitureAllowance +
    mealSubsidy + utilityAllowance + leaveAllowance + shiftAllowance +
    domesticAllowance + hazardAllowance + electricityAllowance +
    discoveryAllowance + carSubsidy + entertainmentAllowance +
    dataAllowance + nightAllowance + arrears + otherAllowances
  )
  const basicSalary = r2(Math.max(0, monthlyGross - totalAllowances))

  return {
    basicSalary,
    housingAllowance,
    transportAllowance,
    furnitureAllowance,
    mealSubsidy,
    utilityAllowance,
    leaveAllowance,
    shiftAllowance,
    domesticAllowance,
    hazardAllowance,
    electricityAllowance,
    discoveryAllowance,
    carSubsidy,
    entertainmentAllowance,
    dataAllowance,
    nightAllowance,
    arrears,
    otherAllowances,
  }
}

function payrollFields(r: any) {
  return {
    basicSalary:            r.basicSalary,
    housingAllowance:       r.housingAllowance,
    transportAllowance:     r.transportAllowance,
    furnitureAllowance:     r.furnitureAllowance,
    mealSubsidy:            r.mealSubsidy,
    utilityAllowance:       r.utilityAllowance,
    leaveAllowance:         r.leaveAllowance,
    shiftAllowance:         r.shiftAllowance,
    domesticAllowance:      r.domesticAllowance,
    hazardAllowance:        r.hazardAllowance,
    electricityAllowance:   r.electricityAllowance,
    discoveryAllowance:     r.discoveryAllowance,
    carSubsidy:             r.carSubsidy,
    entertainmentAllowance: r.entertainmentAllowance,
    dataAllowance:          r.dataAllowance,
    nightAllowance:         r.nightAllowance,
    arrears:                r.arrears,
    otherAllowances:        r.otherAllowances,
    overtimeEarnings:       r.overtimeEarnings,
    grossSalary:            r.grossSalary,
    pensionEmployee:        r.pensionEmployee,
    pensionEmployer:        r.pensionEmployer,
    nhf:                    r.nhf,
    annualRentRelief:       r.annualRentRelief,
    lifeAssuranceAmount:    r.lifeAssuranceAmount,
    annualGrossIncome:      r.annualGrossIncome,
    annualPensionDeduction: r.annualPensionDeduction,
    annualChargeableIncome: r.annualChargeableIncome,
    annualPAYE:             r.annualPAYE,
    monthlyPAYE:            r.monthlyPAYE,
    unionDeductions:        r.unionDeductions,
    cooperativeDeductions:  r.cooperativeDeductions,
    deductionLiabilities:   r.deductionLiabilities,
    otherDeductions:        r.otherDeductions,
    totalDeductions:        r.totalDeductions,
    netSalary:              r.netSalary,
    validationStatus:       r.validationStatus,
    paymentStatus:          r.paymentStatus,
    withheldReason:         r.withheldReason ?? null,
    bankName:               r.bankName,
    accountNumber:          r.accountNumber,
    accountName:            r.accountName,
    pfaName:                r.pfaName,
    rsaPin:                 r.rsaPin,
    pensionNumber:          r.pensionNumber ?? null,
    tin:                    r.tin           ?? null,
  }
}

function r2(v: number): number { return Math.round(v * 100) / 100 }

