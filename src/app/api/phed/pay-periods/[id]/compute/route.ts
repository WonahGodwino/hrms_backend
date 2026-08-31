import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { processOneStaff } from '@/app/lib/phed/payroll-processor'
import type { PhedPayrollInput, PhedSalaryComponents } from '@/app/lib/phed/types'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/phed/pay-periods/:id/compute
// Reads salary components from each staff's onboarding record (PhedStaff),
// runs the full payroll engine, writes computed results to phed_computed_payrolls,
// and advances the period to REVIEW.
// Allowed from VALIDATION_CLOSED (normal flow) or REVIEW (re-compute).
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

    if (!['VALIDATION_CLOSED', 'REVIEW', 'APPROVED'].includes(period.status))
      return withCors(ApiResponse.error('Period must be in VALIDATION_CLOSED, REVIEW or APPROVED status to compute', 400), origin)

    // ── Load all active staff + per-period data ───────────────
    const [allStaff, validations, overtimeEntries, periodAdvances] = await Promise.all([
      (prisma as any).phedStaff.findMany({
        where:   { companyId: period.companyId, isActive: true },
        include: {
          region:               true,
          grade:                { select: { name: true, code: true, defaultBasicSalary: true, allowanceTemplates: true } },
          unions:               { include: { union: true } },
          cooperatives:         { include: { cooperative: true } },
          deductionLiabilities: { include: { deductionLiability: true } },
        },
      }),
      (prisma as any).phedValidation.findMany({ where: { payPeriodId: params.id } }),
      (prisma as any).phedOvertimeEntry.findMany({ where: { payPeriodId: params.id } }),
      (prisma as any).phedStaffPeriodAdvance.findMany({ where: { payPeriodId: params.id } }),
    ])

    if (allStaff.length === 0)
      return withCors(ApiResponse.error('No active staff found for this company.', 400), origin)

    const validationMap       = new Map<string, string>(validations.map((v: any) => [v.staffId, v.status as string]))
    const validationReasonMap = new Map<string, string | null>(validations.map((v: any) => [v.staffId, v.reason as string | null]))
    const overtimeMap         = new Map<string, { hours: number; amount: number }>(
      overtimeEntries.map((ot: any) => [ot.staffId, {
        hours:  Number(ot.overtimeHours  ?? 0),
        amount: Number(ot.computedAmount ?? 0),
      }])
    )
    const advancesMap = new Map<string, any>(periodAdvances.map((a: any) => [a.staffId, a]))

    const results: any[] = []

    for (const staff of allStaff) {
      // Salary components come from the staff onboarding record.
      // Grade default is used for basicSalary if the staff record doesn't override it.
      const salary: PhedSalaryComponents = {
        basicSalary:            Number(staff.basicSalary            ?? staff.grade?.defaultBasicSalary ?? 0),
        housingAllowance:       Number(staff.housingAllowance       ?? 0),
        transportAllowance:     Number(staff.transportAllowance     ?? 0),
        furnitureAllowance:     Number(staff.furnitureAllowance     ?? 0),
        mealSubsidy:            Number(staff.mealSubsidy            ?? 0),
        utilityAllowance:       Number(staff.utilityAllowance       ?? 0),
        leaveAllowance:         Number(staff.leaveAllowance         ?? 0),
        domesticAllowance:      Number(staff.domesticAllowance      ?? 0),
        hazardAllowance:        Number(staff.hazardAllowance        ?? 0),
        electricityAllowance:   Number(staff.electricityAllowance   ?? 0),
        discoveryAllowance:     Number(staff.discoveryAllowance     ?? 0),
        carSubsidy:             Number(staff.carSubsidy             ?? 0),
        entertainmentAllowance: Number(staff.entertainmentAllowance ?? 0),
        dataAllowance:          Number(staff.dataAllowance          ?? 0),
        nightAllowance:         Number(staff.nightAllowance         ?? 0),
        arrears:                Number(staff.arrears                ?? 0),
        otherAllowances:        Number(staff.otherAllowances        ?? 0),
      }

      // Grade allowance templates fill any blank staff-level allowance.
      // A staff-level value always wins (FE guide §2); the template only
      // supplies a default where the staff record carries no amount.
      for (const tpl of staff.grade?.allowanceTemplates ?? []) {
        const field = GRADE_ALLOWANCE_FIELD_MAP[tpl.allowanceType]
        if (!field || Number(salary[field]) !== 0) continue
        salary[field] = tpl.valueType === 'PERCENTAGE'
          ? r2(Number(salary.basicSalary) * Number(tpl.value) / 100)
          : Number(tpl.value)
      }

      const adv = advancesMap.get(staff.id)

      // Cooperative total = sum of all cooperative membership amounts for this staff
      const cooperativeDeductionTotal = staff.cooperatives.reduce(
        (sum: number, sc: any) => sum + Number(sc.totalAmount ?? 0), 0
      )
      // Deduction liability total = sum of all assigned deduction liability amounts
      const deductionLiabilityTotal = staff.deductionLiabilities.reduce(
        (sum: number, sd: any) => sum + Number(sd.amount ?? 0), 0
      )
      // Union deduction = gross × sum(union percentages); computed inside processOneStaff
      const unionDeductionTotal = staff.unions.reduce(
        (sum: number, su: any) => sum + Number(su.union.percentage ?? 0),
        0,
      )

      const input: PhedPayrollInput = {
        staffId:                  staff.id,
        staffDbId:                staff.id,
        staffName:                `${staff.firstName} ${staff.lastName}`,
        staffEmail:               staff.email,
        staffIdCode:              staff.staffId,
        category:                 staff.category,
        gradeName:                staff.grade?.name ?? '',
        department:               staff.department  ?? '',
        unit:                     staff.unit        ?? '',
        regionName:               staff.region?.name ?? '',
        salary,
        hasLifeAssurance:         Boolean(staff.hasLifeAssurance),
        lifeAssuranceAmount:      Number(staff.lifeAssuranceAmount ?? 0),
        overtimeHours:            0,
        overtimeAmount:           (() => {
          const otEntry = overtimeMap.get(staff.id)
          if (!otEntry || otEntry.hours === 0) return 0
          if (otEntry.amount > 0) return otEntry.amount
          const grossBeforeOT = r2(
            salary.basicSalary + salary.housingAllowance + salary.transportAllowance +
            salary.furnitureAllowance + salary.mealSubsidy +
            salary.leaveAllowance + salary.domesticAllowance +
            salary.hazardAllowance + salary.electricityAllowance + salary.discoveryAllowance +
            salary.carSubsidy + salary.entertainmentAllowance + salary.dataAllowance +
            salary.nightAllowance + salary.arrears + salary.otherAllowances
          )
          return r2((grossBeforeOT / 160) * 1.5 * otEntry.hours)
        })(),
        unionDeductionTotal,
        cooperativeDeductionTotal,
        deductionLiabilityTotal,
        voluntaryPension: Number(staff.voluntaryPension ?? 0),
        insurance:        Number(staff.insurance        ?? 0),
        // Period-specific advances (cashAdvanced/loan/domesticLoan) override staff-level defaults
        cashAdvanced:     Number(adv?.cashAdvanced ?? staff.cashAdvanced ?? 0),
        loan:             Number(adv?.loan         ?? staff.loan         ?? 0),
        domesticLoan:     Number(adv?.domesticLoan ?? staff.domesticLoan ?? 0),
        validationStatus:  (validationMap.get(staff.id) as any) ?? 'PENDING',
        withheldReason:    (validationReasonMap.get(staff.id) as string | undefined) ?? undefined,
        bankName:          staff.bankName      ?? '',
        accountNumber:     staff.accountNumber ?? '',
        accountName:       staff.accountName   ?? '',
        pfaName:           staff.pfaName       ?? '',
        rsaPin:            staff.rsaPin        ?? '',
        pensionNumber:     staff.pensionNumber ?? undefined,
        tin:               staff.tin           ?? undefined,
        nhfNumber:         staff.nhfNumber     ?? undefined,
      }

      results.push({ result: processOneStaff(input), staff })
    }

    // ── Persist computed results (upsert — no prior template upload required) ──
    // Batch by a bounded chunk size so a large workforce can't open hundreds of
    // concurrent upserts against the pg pool (max 10), which would queue past
    // `connectionTimeoutMillis` and fail with a 500 "timeout exceeded".
    const upsertComputed = ({ result: r }: { result: any }) =>
      (prisma as any).phedComputedPayroll.upsert({
        where:  { payPeriodId_staffId: { payPeriodId: params.id, staffId: r.staffId } },
        create: {
          payPeriodId: params.id,
          staffId:     r.staffId,
          companyId:   period.companyId,
          staffName:   r.staffName,
          staffEmail:  r.staffEmail,
          staffIdCode: r.staffIdCode,
          category:    r.category,
          gradeName:   r.gradeName,
          department:  r.department,
          unit:        r.unit,
          regionName:  r.regionName,
          ...fullPayrollFields(r),
        },
        update: {
          staffName:   r.staffName,
          staffEmail:  r.staffEmail,
          staffIdCode: r.staffIdCode,
          category:    r.category,
          gradeName:   r.gradeName,
          department:  r.department,
          unit:        r.unit,
          regionName:  r.regionName,
          ...fullPayrollFields(r),
        },
      })

    const BATCH_SIZE = 50
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(upsertComputed))
    }

    const overtimeResults = results.filter(({ result: r }) => r.overtimeEarnings > 0)
    for (let i = 0; i < overtimeResults.length; i += BATCH_SIZE) {
      const batch = overtimeResults.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(({ result: r }) =>
          (prisma as any).phedOvertimeEntry.updateMany({
            where: { payPeriodId: params.id, staffId: r.staffId },
            data:  { computedAmount: r.overtimeEarnings },
          })
        )
      )
    }

    // ── Advance to REVIEW ─────────────────────────────────────
    const updatedPeriod = await (prisma as any).phedPayPeriod.update({
      where: { id: params.id },
      data:  { status: 'REVIEW' },
    })

    const summary = {
      totalStaff:    results.length,
      activeStaff:   results.filter(({ result: r }) => r.paymentStatus === 'ACTIVE').length,
      withheldStaff: results.filter(({ result: r }) => r.paymentStatus === 'WITHHELD').length,
      totalGross:    r2(results.reduce((s, { result: r }) => s + r.grossSalary, 0)),
      totalNet:      r2(results.reduce((s, { result: r }) => s + r.netSalary, 0)),
      totalPAYE:     r2(results.reduce((s, { result: r }) => s + r.monthlyPAYE, 0)),
      totalPension:  r2(results.reduce((s, { result: r }) => s + r.pensionEmployee + r.pensionEmployer, 0)),
    }

    return withCors(
      ApiResponse.success(
        { period: updatedPeriod, summary },
        'Payroll computed successfully. Period is now in REVIEW — download the review template to verify.'
      ),
      origin
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

function fullPayrollFields(r: any) {
  return {
    basicSalary:            r.basicSalary,
    housingAllowance:       r.housingAllowance,
    transportAllowance:     r.transportAllowance,
    furnitureAllowance:     r.furnitureAllowance,
    mealSubsidy:            r.mealSubsidy,
    utilityAllowance:       r.utilityAllowance,
    leaveAllowance:         r.leaveAllowance,
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
    grossSalary:            r.grossSalary,
    overtimeEarnings:       r.overtimeEarnings,
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
    voluntaryPension:       r.voluntaryPension,
    insurance:              r.insurance,
    cashAdvanced:           r.cashAdvanced,
    loan:                   r.loan,
    domesticLoan:           r.domesticLoan,
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
    nhfNumber:              r.nhfNumber     ?? null,
  }
}

function r2(v: number): number { return Math.round(v * 100) / 100 }

// Maps PhedAllowanceTemplate.allowanceType to the salary component it feeds.
const GRADE_ALLOWANCE_FIELD_MAP: Record<string, keyof PhedSalaryComponents> = {
  HOUSING: 'housingAllowance',
  TRANSPORT: 'transportAllowance',
  FURNITURE: 'furnitureAllowance',
  MEAL_SUBSIDY: 'mealSubsidy',
  UTILITY: 'utilityAllowance',
  LEAVE: 'leaveAllowance',
  DOMESTIC: 'domesticAllowance',
  HAZARD: 'hazardAllowance',
  ELECTRICITY: 'electricityAllowance',
  DISCOVERY: 'discoveryAllowance',
  CAR_SUBSIDY: 'carSubsidy',
  ENTERTAINMENT: 'entertainmentAllowance',
  DATA: 'dataAllowance',
  NIGHT: 'nightAllowance',
  ARREARS: 'arrears',
  OTHER: 'otherAllowances',
}
