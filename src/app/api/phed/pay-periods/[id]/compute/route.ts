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
// Reads salary inputs already stored by upload-template, runs the full payroll
// engine for every staff member, writes computed results back to phed_computed_payrolls,
// and advances the period to REVIEW.
// Allowed from PROCESSING (normal flow) or REVIEW (re-compute).
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

    if (!['PROCESSING', 'REVIEW'].includes(period.status))
      return withCors(ApiResponse.error('Period must be in PROCESSING or REVIEW status to compute', 400), origin)

    // ── Load stored salary inputs + all deduction references ──
    const [storedPayrolls, allStaff, validations, overtimeEntries, periodAdvances] = await Promise.all([
      // Salary inputs saved by upload-template
      (prisma as any).phedComputedPayroll.findMany({
        where: { payPeriodId: params.id },
      }),
      // Staff with union/cooperative/deduction memberships
      (prisma as any).phedStaff.findMany({
        where:   { companyId: period.companyId, isActive: true },
        include: {
          region:               true,
          grade:                { select: { name: true, code: true } },
          unions:               { include: { union: true } },
          cooperatives:         { include: { cooperative: true } },
          deductionLiabilities: { include: { deductionLiability: true } },
        },
      }),
      (prisma as any).phedValidation.findMany({ where: { payPeriodId: params.id } }),
      (prisma as any).phedOvertimeEntry.findMany({ where: { payPeriodId: params.id } }),
      (prisma as any).phedStaffPeriodAdvance.findMany({ where: { payPeriodId: params.id } }),
    ])

    if (storedPayrolls.length === 0)
      return withCors(ApiResponse.error('No salary data found. Please upload the filled template first.', 400), origin)

    // Build lookup maps
    const salaryMap         = new Map<string, any>(storedPayrolls.map((p: any) => [p.staffId, p]))
    const staffMap          = new Map<string, any>(allStaff.map((s: any) => [s.id, s]))
    const validationMap     = new Map<string, string>(validations.map((v: any) => [v.staffId, v.status as string]))
    const validationReasonMap = new Map<string, string | null>(validations.map((v: any) => [v.staffId, v.reason as string | null]))
    const overtimeMap       = new Map<string, { hours: number; amount: number }>(
      overtimeEntries.map((ot: any) => [ot.staffId, {
        hours:  Number(ot.overtimeHours  ?? 0),
        amount: Number(ot.computedAmount ?? 0),
      }])
    )
    const advancesMap       = new Map<string, any>(periodAdvances.map((a: any) => [a.staffId, a]))

    const results: any[] = []

    for (const stored of storedPayrolls) {
      const staff = staffMap.get(stored.staffId)
      if (!staff) continue

      const salary: PhedSalaryComponents = {
        basicSalary:            Number(stored.basicSalary ?? 0),
        housingAllowance:       Number(stored.housingAllowance ?? 0),
        transportAllowance:     Number(stored.transportAllowance ?? 0),
        furnitureAllowance:     Number(stored.furnitureAllowance ?? 0),
        mealSubsidy:            Number(stored.mealSubsidy ?? 0),
        utilityAllowance:       Number(stored.utilityAllowance ?? 0),
        leaveAllowance:         Number(stored.leaveAllowance ?? 0),
        shiftAllowance:         Number(stored.shiftAllowance ?? 0),
        domesticAllowance:      Number(stored.domesticAllowance ?? 0),
        hazardAllowance:        Number(stored.hazardAllowance ?? 0),
        electricityAllowance:   Number(stored.electricityAllowance ?? 0),
        discoveryAllowance:     Number(stored.discoveryAllowance ?? 0),
        carSubsidy:             Number(stored.carSubsidy ?? 0),
        entertainmentAllowance: Number(stored.entertainmentAllowance ?? 0),
        dataAllowance:          Number(stored.dataAllowance ?? 0),
        nightAllowance:         Number(stored.nightAllowance ?? 0),
        arrears:                Number(stored.arrears ?? 0),
        otherAllowances:        Number(stored.otherAllowances ?? 0),
      }

      const adv = advancesMap.get(staff.id)

      // Cooperative and deduction-liability totals come from the uploaded template (HR-entered).
      // Union deductions are auto-computed as gross × sum(union percentages) — never HR-entered.
      const cooperativeDeductionTotal = Number(stored.cooperativeDeductions ?? 0)
      const deductionLiabilityTotal   = Number(stored.deductionLiabilities  ?? 0)
      // percentage stored as decimal fraction (e.g. 0.025 for 2.5%)
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
          // computedAmount not stored — derive from stored gross before OT
          const grossBeforeOT = r2(
            salary.basicSalary + salary.housingAllowance + salary.transportAllowance +
            salary.furnitureAllowance + salary.mealSubsidy + salary.utilityAllowance +
            salary.leaveAllowance + salary.shiftAllowance + salary.domesticAllowance +
            salary.hazardAllowance + salary.electricityAllowance + salary.discoveryAllowance +
            salary.carSubsidy + salary.entertainmentAllowance + salary.dataAllowance +
            salary.nightAllowance + salary.arrears + salary.otherAllowances
          )
          return r2((grossBeforeOT / 160) * 1.5 * otEntry.hours)
        })(),
        unionDeductionTotal,
        cooperativeDeductionTotal,
        deductionLiabilityTotal,
        voluntaryPension:         Number(stored.voluntaryPension ?? 0),
        insurance:                Number(stored.insurance ?? 0),
        cashAdvanced:             Number(adv?.cashAdvanced ?? stored.cashAdvanced ?? 0),
        loan:                     Number(adv?.loan         ?? stored.loan         ?? 0),
        domesticLoan:             Number(adv?.domesticLoan ?? stored.domesticLoan ?? 0),
        validationStatus:         (validationMap.get(staff.id) as any) ?? 'PENDING',
        withheldReason:           (validationReasonMap.get(staff.id) as string | undefined) ?? undefined,
        bankName:                 staff.bankName      ?? '',
        accountNumber:            staff.accountNumber ?? '',
        accountName:              staff.accountName   ?? '',
        pfaName:                  staff.pfaName       ?? '',
        rsaPin:                   staff.rsaPin        ?? '',
        pensionNumber:            staff.pensionNumber ?? undefined,
        tin:                      staff.tin           ?? undefined,
      }

      results.push({ result: processOneStaff(input), staff })
    }

    // ── Persist full computed results + write OT amount back ──
    await Promise.all([
      ...results.map(({ result: r }) =>
        (prisma as any).phedComputedPayroll.update({
          where: { payPeriodId_staffId: { payPeriodId: params.id, staffId: r.staffId } },
          data:  fullPayrollFields(r),
        })
      ),
      // Write computed overtime amounts back to phedOvertimeEntry so GET /overtime reflects them
      ...results
        .filter(({ result: r }) => r.overtimeEarnings > 0)
        .map(({ result: r }) =>
          (prisma as any).phedOvertimeEntry.updateMany({
            where: { payPeriodId: params.id, staffId: r.staffId },
            data:  { computedAmount: r.overtimeEarnings },
          })
        ),
    ])

    // ── Advance to REVIEW ──────────────────────────────────────
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
  }
}

function r2(v: number): number { return Math.round(v * 100) / 100 }
