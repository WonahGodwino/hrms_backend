/**
 * Tax Engine Service
 *
 * Implements Nigeria 2026 PAYE Tax Calculation with:
 * - Rent Relief (new 2026 law - 20% of annual rent, capped at N500,000)
 * - Consolidated Relief Allowance (CRA)
 * - N800,000 Zero Tax Threshold
 * - Progressive Tax Bands (7% - 24%)
 */

import {
  TaxCalculationInput,
  TaxCalculationResult,
  TaxBand,
  OvertimeCalculationInput,
  TaxBreakdownItem,
} from './types'

// Nigeria 2026 Progressive Tax Bands (Annual amounts in Naira)
const TAX_BANDS: TaxBand[] = [
  { limit: 300000, rate: 0.07 }, // First N300,000 at 7%
  { limit: 300000, rate: 0.11 }, // Next N300,000 at 11%
  { limit: 500000, rate: 0.15 }, // Next N500,000 at 15%
  { limit: 500000, rate: 0.19 }, // Next N500,000 at 19%
  { limit: 1600000, rate: 0.21 }, // Next N1,600,000 at 21%
  { limit: Infinity, rate: 0.24 }, // Above N3,200,000 at 24%
]

// Nigeria 2026 Tax Constants
const RENT_RELIEF_CAP = 500000 // N500,000 annual cap
const RENT_RELIEF_RATE = 0.2 // 20% of annual rent
const ZERO_TAX_THRESHOLD = 800000 // N800,000 annual threshold
const PENSION_EMPLOYEE_RATE = 0.08 // 8% employee contribution
const PENSION_EMPLOYER_RATE = 0.1 // 10% employer contribution
const NHF_RATE = 0.025 // 2.5% of basic salary
const NHIS_RATE = 0.05 // 5% if applicable
const CRA_FIXED = 200000 // N200,000 minimum CRA
const CRA_GROSS_RATE = 0.21 // 1% + 20% = 21% of gross

/**
 * Calculate monthly gross income from all earnings
 */
export function calculateMonthlyGross(input: TaxCalculationInput): number {
  return (
    input.basicSalary +
    input.housingAllowance +
    input.transportAllowance +
    input.dressingAllowance +
    input.leaveAllowance +
    input.entertainmentAllowance +
    input.utilityAllowance +
    input.otherAllowances +
    input.overtimeEarnings +
    input.bonusKpi
  )
}

/**
 * Calculate Rent Relief (2026 Law)
 * = LOWER of: 20% of Annual Rent OR N500,000
 */
export function calculateRentRelief(annualRent: number): number {
  if (!annualRent || annualRent <= 0) return 0
  const relief = annualRent * RENT_RELIEF_RATE
  return Math.min(relief, RENT_RELIEF_CAP)
}

/**
 * Apply progressive tax bands to chargeable income
 */
export function applyTaxBands(chargeableIncome: number): number {
  let remainingIncome = chargeableIncome
  let totalTax = 0

  for (const band of TAX_BANDS) {
    if (remainingIncome <= 0) break

    const taxableInBand = Math.min(remainingIncome, band.limit)
    totalTax += taxableInBand * band.rate
    remainingIncome -= taxableInBand
  }

  return Math.round(totalTax * 100) / 100 // Round to 2 decimal places
}

/**
 * Calculate PAYE Tax following Nigeria 2026 Tax Law
 * Execute calculations in the EXACT order specified in the requirements
 */
export function calculatePAYE(input: TaxCalculationInput): TaxCalculationResult {
  // Step 1: Calculate Monthly Gross Income
  const monthlyGross = calculateMonthlyGross(input)
  const annualGross = monthlyGross * 12

  // Step 2: Calculate Statutory Exemptions
  const pensionableEarnings =
    input.basicSalary + input.housingAllowance + input.transportAllowance

  const monthlyPensionEmployee = pensionableEarnings * PENSION_EMPLOYEE_RATE
  const monthlyPensionEmployer = pensionableEarnings * PENSION_EMPLOYER_RATE
  const annualPensionEmployee = monthlyPensionEmployee * 12

  const monthlyNHF = input.basicSalary * NHF_RATE
  const annualNHF = monthlyNHF * 12

  const monthlyNHIS = input.nhisApplicable ? monthlyGross * NHIS_RATE : 0
  const annualNHIS = monthlyNHIS * 12

  const totalAnnualStatutoryExemptions =
    annualPensionEmployee + annualNHF + annualNHIS

  // Step 3: Calculate Rent Relief (New 2026 Law)
  const rentRelief = calculateRentRelief(input.annualRent)

  // Step 4: Calculate Consolidated Relief Allowance (CRA)
  // CRA = HIGHER of: N200,000 OR (1% of Gross + 20% of Gross) = 21% of Gross
  const craOption1 = CRA_FIXED
  const craOption2 = annualGross * CRA_GROSS_RATE
  const consolidatedReliefAllowance = Math.max(craOption1, craOption2)

  // Step 5: Calculate Chargeable Income
  const chargeableIncome = Math.max(
    0,
    annualGross -
      totalAnnualStatutoryExemptions -
      rentRelief -
      consolidatedReliefAllowance
  )

  // Step 6: Apply N800k Rule
  if (chargeableIncome <= ZERO_TAX_THRESHOLD) {
    return {
      monthlyGross,
      annualGross,
      pensionEmployee: monthlyPensionEmployee,
      pensionEmployer: monthlyPensionEmployer,
      nhf: monthlyNHF,
      nhis: monthlyNHIS,
      totalStatutoryDeductions: monthlyPensionEmployee + monthlyNHF + monthlyNHIS,
      rentRelief,
      consolidatedReliefAllowance,
      chargeableIncome,
      annualPAYE: 0,
      monthlyPAYE: 0,
      effectiveTaxRate: 0,
    }
  }

  // Step 7: Apply Progressive Tax Bands
  const annualPAYE = applyTaxBands(chargeableIncome)
  const monthlyPAYE = annualPAYE / 12

  return {
    monthlyGross,
    annualGross,
    pensionEmployee: monthlyPensionEmployee,
    pensionEmployer: monthlyPensionEmployer,
    nhf: monthlyNHF,
    nhis: monthlyNHIS,
    totalStatutoryDeductions: monthlyPensionEmployee + monthlyNHF + monthlyNHIS,
    rentRelief,
    consolidatedReliefAllowance,
    chargeableIncome,
    annualPAYE,
    monthlyPAYE,
    effectiveTaxRate: (annualPAYE / annualGross) * 100,
  }
}

/**
 * Calculate overtime earnings
 * Formula: (Basic Salary / Monthly Hours) * Multiplier * Overtime Hours
 */
export function calculateOvertime(input: OvertimeCalculationInput): number {
  if (input.monthlyHours <= 0) return 0
  const hourlyRate = input.basicSalary / input.monthlyHours
  return hourlyRate * input.multiplier * input.overtimeHours
}

/**
 * Calculate total overtime earnings from multiple entries
 */
export function calculateTotalOvertime(
  basicSalary: number,
  monthlyHours: number,
  overtimeEntries: { hours: number; multiplier: number }[]
): number {
  return overtimeEntries.reduce((total, entry) => {
    return (
      total +
      calculateOvertime({
        basicSalary,
        monthlyHours,
        overtimeHours: entry.hours,
        multiplier: entry.multiplier,
      })
    )
  }, 0)
}

/**
 * Get detailed tax breakdown for transparency
 */
export function getTaxBreakdown(chargeableIncome: number): TaxBreakdownItem[] {
  const breakdown: TaxBreakdownItem[] = []
  let remainingIncome = chargeableIncome

  const bandNames = [
    'First N300,000',
    'Next N300,000',
    'Next N500,000',
    'Next N500,000',
    'Next N1,600,000',
    'Above N3,200,000',
  ]

  for (let i = 0; i < TAX_BANDS.length && remainingIncome > 0; i++) {
    const band = TAX_BANDS[i]
    const taxableInBand = Math.min(remainingIncome, band.limit)
    const taxInBand = taxableInBand * band.rate

    breakdown.push({
      band: bandNames[i],
      taxable: taxableInBand,
      rate: band.rate * 100,
      tax: Math.round(taxInBand * 100) / 100,
    })

    remainingIncome -= taxableInBand
  }

  return breakdown
}

/**
 * Get tax constants for documentation/display
 */
export function getTaxConstants() {
  return {
    rentReliefCap: RENT_RELIEF_CAP,
    rentReliefRate: RENT_RELIEF_RATE,
    zeroTaxThreshold: ZERO_TAX_THRESHOLD,
    pensionEmployeeRate: PENSION_EMPLOYEE_RATE,
    pensionEmployerRate: PENSION_EMPLOYER_RATE,
    nhfRate: NHF_RATE,
    nhisRate: NHIS_RATE,
    craFixed: CRA_FIXED,
    craGrossRate: CRA_GROSS_RATE,
    taxBands: TAX_BANDS,
  }
}
