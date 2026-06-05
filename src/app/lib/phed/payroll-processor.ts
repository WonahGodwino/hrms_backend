// ============================================================
// PHED Module – Payroll Processor
// ============================================================

import { deriveTaxData, getNhfMonthly } from './tax-engine'
import type { PhedPayrollInput, PhedPayrollResult } from './types'

/**
 * Compute payroll for a single staff member.
 * In the template-driven flow, salary values come from the uploaded XLSX.
 * Overtime amount is pre-computed and stored before the template is issued.
 */
export function processOneStaff(input: PhedPayrollInput): PhedPayrollResult {
  const {
    salary,
    hasLifeAssurance,
    lifeAssuranceAmount,
    overtimeAmount,
    unionDeductionTotal,
    cooperativeDeductionTotal,
    deductionLiabilityTotal,
    voluntaryPension,
    insurance,
    cashAdvanced,
    loan,
    domesticLoan,
    validationStatus,
  } = input

  const {
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
  } = salary

  // ── Earnings ──────────────────────────────────────────────
  const grossBeforeOT = r2(
    basicSalary +
    housingAllowance +
    transportAllowance +
    furnitureAllowance +
    mealSubsidy +
    utilityAllowance +
    leaveAllowance +
    shiftAllowance +
    domesticAllowance +
    hazardAllowance +
    electricityAllowance +
    discoveryAllowance +
    carSubsidy +
    entertainmentAllowance +
    dataAllowance +
    nightAllowance +
    arrears +
    otherAllowances
  )

  // Overtime amount was pre-computed at hours-upload time and stored; use it directly.
  const overtimeEarnings = r2(overtimeAmount)
  const grossSalary      = r2(grossBeforeOT + overtimeEarnings)

  // ── Statutory Deductions ──────────────────────────────────
  const pensionable = r2(basicSalary + housingAllowance + transportAllowance)

  const annualLifeAssurance = lifeAssuranceAmount > 0 ? lifeAssuranceAmount : 0
  const taxData = deriveTaxData(grossSalary, pensionable, annualLifeAssurance)
  const nhf     = getNhfMonthly(basicSalary)

  // ── Variable Deductions ───────────────────────────────────
  const unionDeductions       = r2(grossSalary * unionDeductionTotal)
  const cooperativeDeductions = r2(cooperativeDeductionTotal)
  const deductionLiabilities  = r2(deductionLiabilityTotal)

  const totalDeductions = r2(
    taxData.pensionEmployee +
    nhf +
    taxData.monthlyPAYE +
    unionDeductions +
    cooperativeDeductions +
    deductionLiabilities +
    voluntaryPension +
    insurance +
    cashAdvanced +
    loan +
    domesticLoan
  )

  const netSalary    = r2(grossSalary - totalDeductions)
  const paymentStatus = validationStatus === 'NO_FOR_PAYMENT' ? 'WITHHELD' : 'ACTIVE'

  return {
    staffId:      input.staffId,
    staffName:    input.staffName,
    staffEmail:   input.staffEmail,
    staffIdCode:  input.staffIdCode,
    category:     input.category,
    gradeName:    input.gradeName,
    department:   input.department,
    unit:         input.unit,
    regionName:   input.regionName,

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
    overtimeEarnings,
    grossSalary,

    pensionEmployee:        taxData.pensionEmployee,
    pensionEmployer:        taxData.pensionEmployer,
    nhf,

    annualRentRelief:       taxData.rentRelief,
    lifeAssuranceAmount:    taxData.lifeAssuranceAmount,
    annualGrossIncome:      taxData.annualGrossIncome,
    annualPensionDeduction: taxData.annualPensionDeduction,
    annualChargeableIncome: taxData.annualChargeableIncome,
    annualPAYE:             taxData.annualPAYE,
    monthlyPAYE:            taxData.monthlyPAYE,

    unionDeductions,
    cooperativeDeductions,
    deductionLiabilities,
    voluntaryPension,
    insurance,
    cashAdvanced,
    loan,
    domesticLoan,
    otherDeductions:  0,
    totalDeductions,

    netSalary,
    validationStatus,
    paymentStatus,
    withheldReason: paymentStatus === 'WITHHELD' ? input.withheldReason : undefined,

    bankName:      input.bankName,
    accountNumber: input.accountNumber,
    accountName:   input.accountName,
    pfaName:       input.pfaName,
    rsaPin:        input.rsaPin,
    pensionNumber: input.pensionNumber,
    tin:           input.tin,
  }
}

function r2(v: number): number {
  return Math.round(v * 100) / 100
}
