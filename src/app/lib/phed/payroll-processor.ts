// ============================================================
// PHED Module – Payroll Processor
// ============================================================

import { deriveTaxData, getNhfMonthly, NHF_RATE } from './tax-engine'
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

  // Prorate recurring salary components for staff who exited mid-month.
  // Arrears (backpay) and overtime (already-worked hours) are NOT prorated.
  const prorationFactor = Math.min(1, Math.max(0, input.prorationFactor ?? 1))
  const pr = (v: number) => r2(v * prorationFactor)

  const {
    basicSalary,
    housingAllowance,
    transportAllowance,
    furnitureAllowance,
    mealSubsidy,
    utilityAllowance,
    leaveAllowance,
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
  } = {
    basicSalary:            pr(salary.basicSalary),
    housingAllowance:       pr(salary.housingAllowance),
    transportAllowance:     pr(salary.transportAllowance),
    furnitureAllowance:     pr(salary.furnitureAllowance),
    mealSubsidy:            pr(salary.mealSubsidy),
    utilityAllowance:       pr(salary.utilityAllowance),
    leaveAllowance:         pr(salary.leaveAllowance),
    domesticAllowance:      pr(salary.domesticAllowance),
    hazardAllowance:        pr(salary.hazardAllowance),
    electricityAllowance:   pr(salary.electricityAllowance),
    discoveryAllowance:     pr(salary.discoveryAllowance),
    carSubsidy:             pr(salary.carSubsidy),
    entertainmentAllowance: pr(salary.entertainmentAllowance),
    dataAllowance:          pr(salary.dataAllowance),
    nightAllowance:         pr(salary.nightAllowance),
    arrears:                salary.arrears,
    otherAllowances:        pr(salary.otherAllowances),
  }

  // ── Earnings ──────────────────────────────────────────────
  // Initial Gross Pay (FE guide §3): the agreed package HR spreads across
  // Basic + Housing + Transport + Furniture + Domestic + Meal Subsidy +
  // Hazard + Leave Grant + Electricity + Other Allowances. Utility is tracked
  // as a separate field but is NOT part of Initial Gross or the add-on layer
  // (the staff template has no Utility column), so it is excluded from gross.
  const initialGrossPay = r2(
    basicSalary +
    housingAllowance +
    transportAllowance +
    furnitureAllowance +
    mealSubsidy +
    leaveAllowance +
    domesticAllowance +
    hazardAllowance +
    electricityAllowance +
    otherAllowances
  )
  const grossBeforeOT = r2(
    initialGrossPay +
    discoveryAllowance +
    carSubsidy +
    entertainmentAllowance +
    dataAllowance +
    nightAllowance +
    arrears
  )

  // Overtime amount was pre-computed at hours-upload time and stored; use it directly.
  const overtimeEarnings = r2(overtimeAmount)
  const grossSalary      = r2(grossBeforeOT + overtimeEarnings)

  // ── Statutory Deductions ──────────────────────────────────
  // Template: Total taxable income = Gross Pay − (Reimbursement + Life Assurance
  // + NHF + Employee Pension + Voluntary Pension + Insurance + Rent Relief).
  // Overtime and arrears are part of Gross Pay and are therefore taxable.
  // Pension stays on the narrower Basic + Housing + Transport base.
  const pensionable = r2(basicSalary + housingAllowance + transportAllowance)
  const nhf         = getNhfMonthly(basicSalary)
  // Template "Reimbursement" = Discretionary + Car Subsidy + Entertainment +
  // Data Allowance + Night Allowance (tax-exempt).
  const reimbursement = r2(discoveryAllowance + carSubsidy + entertainmentAllowance + dataAllowance + nightAllowance)

  const monthlyLifeAssurance = lifeAssuranceAmount > 0 ? lifeAssuranceAmount : 0
  const taxData = deriveTaxData({
    monthlyGrossPay:         grossSalary,
    monthlyPensionable:      pensionable,
    monthlyReimbursement:    reimbursement,
    monthlyNhf:              basicSalary * NHF_RATE, // full precision for the tax base
    monthlyVoluntaryPension: voluntaryPension,
    monthlyInsurance:        insurance,
    lifeAssuranceAmount:     monthlyLifeAssurance,
  })

  // ── Variable Deductions ───────────────────────────────────
  // Template: union check-off (NUEE 3.8%, SSAEAC 3%) is a % of Basic, not gross.
  const unionDeductions       = r2(basicSalary * unionDeductionTotal)
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
  // Only staff explicitly validated "Yes for Payment" are payable. Everything
  // else (No, Pending, or no validation record) is withheld so unvalidated
  // staff never receive a payslip.
  const paymentStatus = validationStatus === 'YES_FOR_PAYMENT' ? 'ACTIVE' : 'WITHHELD'

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
    nhfNumber:     input.nhfNumber,
  }
}

function r2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Overtime earnings (PHED rule):
 *   1) computed overtime hours = input hours × 1.5
 *   2) hourly pay = monthly gross ÷ 730
 *   3) overtime earnings = hourly pay × computed overtime hours
 * Overtime earnings are part of Gross Pay and therefore taxable income.
 */
export function computeOvertimeEarnings(overtimeHours: number, monthlyGross: number): number {
  if (!Number.isFinite(overtimeHours) || overtimeHours <= 0) return 0
  if (!Number.isFinite(monthlyGross) || monthlyGross <= 0) return 0
  return r2((overtimeHours * 1.5) * (monthlyGross / 730))
}
