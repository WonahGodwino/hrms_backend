// ============================================================
// PHED Module – Nigeria Tax Act 2025 PAYE Engine
// ============================================================

import type { TaxBand } from './types'

// Progressive bands (annual chargeable income)
const TAX_BANDS: TaxBand[] = [
  { from: 0,          to: 800_000,    rate: 0.00 },
  { from: 800_001,    to: 3_000_000,  rate: 0.15 },
  { from: 3_000_001,  to: 12_000_000, rate: 0.18 },
  { from: 12_000_001, to: 25_000_000, rate: 0.21 },
  { from: 25_000_001, to: 50_000_000, rate: 0.23 },
  { from: 50_000_001, to: Infinity,   rate: 0.25 },
]

const RENT_RELIEF            = 500_000   // Fixed ₦500,000 for all staff (NTA 2025)
const PENSION_EMPLOYEE_RATE  = 0.08      // 8% of pensionable emoluments
const PENSION_EMPLOYER_RATE  = 0.10      // 10% of pensionable emoluments
const NHF_RATE               = 0.025     // 2.5% of monthly basic salary

/**
 * Compute annual PAYE using the NTA 2025 progressive bands.
 * Returns 0 if annualChargeableIncome ≤ 800,000.
 */
export function computeAnnualPAYE(annualChargeableIncome: number): number {
  if (annualChargeableIncome <= 800_000) return 0

  let tax = 0
  let remaining = annualChargeableIncome

  for (const band of TAX_BANDS) {
    if (remaining <= 0) break
    if (annualChargeableIncome < band.from) break

    const bandTop    = band.to === Infinity ? annualChargeableIncome : band.to
    const bandBottom = band.from
    const taxable    = Math.min(remaining, bandTop - bandBottom)

    if (taxable > 0) {
      tax      += taxable * band.rate
      remaining -= taxable
    }
  }

  return Math.round(tax * 100) / 100
}

/**
 * Full tax derivation for one staff member.
 *
 * @param monthlyGross         Total monthly gross (before any deductions)
 * @param monthlyPensionable   Basic + Housing + Transport (pensionable emoluments)
 * @param lifeAssuranceAmount  Annual life assurance premium (0 if staff has none)
 */
export function deriveTaxData(
  monthlyGross: number,
  monthlyPensionable: number,
  lifeAssuranceAmount: number = 0
): {
  pensionEmployee: number
  pensionEmployer: number
  nhfMonthly: number
  rentRelief: number
  lifeAssuranceAmount: number
  annualGrossIncome: number
  annualPensionDeduction: number
  annualChargeableIncome: number
  annualPAYE: number
  monthlyPAYE: number
} {
  const pensionEmployee = round2(monthlyPensionable * PENSION_EMPLOYEE_RATE)
  const pensionEmployer = round2(monthlyPensionable * PENSION_EMPLOYER_RATE)

  // NHF computed separately in payroll-processor (needs basicSalary directly)
  const nhfMonthly = 0

  const annualGrossIncome      = round2(monthlyGross * 12)
  const annualPensionDeduction = round2(pensionEmployee * 12)
  const rentRelief             = RENT_RELIEF
  const lifeAssurance          = round2(Math.max(0, lifeAssuranceAmount))

  const annualChargeableIncome = Math.max(
    0,
    round2(annualGrossIncome - annualPensionDeduction - rentRelief - lifeAssurance)
  )
  const annualPAYE  = computeAnnualPAYE(annualChargeableIncome)
  const monthlyPAYE = round2(annualPAYE / 12)

  return {
    pensionEmployee,
    pensionEmployer,
    nhfMonthly,
    rentRelief,
    lifeAssuranceAmount: lifeAssurance,
    annualGrossIncome,
    annualPensionDeduction,
    annualChargeableIncome,
    annualPAYE,
    monthlyPAYE,
  }
}

export function getNhfMonthly(basicSalary: number): number {
  return round2(basicSalary * NHF_RATE)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
