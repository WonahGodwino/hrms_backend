// ============================================================
// PHED Module – Payroll Processor
// ============================================================

import { deriveTaxData, getNhfMonthly } from './tax-engine'
import type { PhedPayrollInput, PhedPayrollResult } from './types'

const OVERTIME_MONTHLY_HOURS = 160
const OVERTIME_MULTIPLIER    = 1.5

/**
 * Compute payroll for a single staff member.
 * Called once per staff per pay period during the compute step.
 */
export function processOneStaff(input: PhedPayrollInput): PhedPayrollResult {
  const {
    salary,
    annualRent,
    hasLifeAssurance,
    lifeAssuranceAmount,
    overtimeHours,
    unionDeductionTotal,
    cooperativeDeductionTotal,
    deductionLiabilityTotal,
    validationStatus,
  } = input

  // ── Earnings ──────────────────────────────────────────────
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

  // Monthly gross BEFORE overtime (used for overtime rate calculation)
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

  // Overtime: (Monthly Gross / 160) × 1.5 × OT Hours
  const overtimeEarnings = r2(
    (grossBeforeOT / OVERTIME_MONTHLY_HOURS) * OVERTIME_MULTIPLIER * overtimeHours
  )

  const grossSalary = r2(grossBeforeOT + overtimeEarnings)

  // ── Statutory Deductions ──────────────────────────────────
  // Pensionable emoluments = Basic + Housing + Transport
  const pensionable = r2(basicSalary + housingAllowance + transportAllowance)

  // Apply life assurance whenever a positive annual premium exists, regardless of the flag
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
    deductionLiabilities
  )

  const netSalary = r2(grossSalary - totalDeductions)

  // ── Payment status from validation ────────────────────────
  const paymentStatus =
    validationStatus === 'NO_FOR_PAYMENT' ? 'WITHHELD' : 'ACTIVE'

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

