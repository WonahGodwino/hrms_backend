// ============================================================
// PHED Module – Nigeria Tax Act 2025 PAYE Engine
// ============================================================

import type { TaxBand } from './types'

// Progressive bands (annual chargeable income)
const TAX_BANDS: TaxBand[] = [
  { from: 0,          to: 800_000,    rate: 0.00 },
  { from: 800_000,    to: 3_000_000,  rate: 0.15 },
  { from: 3_000_000,  to: 12_000_000, rate: 0.18 },
  { from: 12_000_000, to: 25_000_000, rate: 0.21 },
  { from: 25_000_000, to: 50_000_000, rate: 0.23 },
  { from: 50_000_000, to: Infinity,   rate: 0.25 },
]

const RENT_RELIEF            = 500_000   // Fixed ₦500,000 for all staff (NTA 2025)
const PENSION_EMPLOYEE_RATE  = 0.08      // 8% of pensionable emoluments
const PENSION_EMPLOYER_RATE  = 0.10      // 10% of pensionable emoluments
export const NHF_RATE        = 0.025     // 2.5% of monthly basic salary

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
 * Monthly PAYE using the template's exact per-band ROUND(IF(…),2) logic.
 * Monthly thresholds are the annual band limits divided by 12.
 */
export function computeMonthlyPAYE(monthlyChargeableIncome: number): number {
  const m = Math.max(0, monthlyChargeableIncome)
  const band1 = 0 // first ₦800,000/yr @ 0%
  const band2 = round2((800_000 / 12) > m ? 0 : ((3_000_000 / 12) > m ? (m - 800_000 / 12) * 0.15 : (2_200_000 / 12) * 0.15))
  const band3 = round2((3_000_000 / 12) > m ? 0 : ((12_000_000 / 12) > m ? (m - 3_000_000 / 12) * 0.18 : (9_000_000 / 12) * 0.18))
  const band4 = round2((12_000_000 / 12) > m ? 0 : ((25_000_000 / 12) > m ? (m - 12_000_000 / 12) * 0.21 : (13_000_000 / 12) * 0.21))
  const band5 = round2((25_000_000 / 12) > m ? 0 : ((50_000_000 / 12) > m ? (m - 25_000_000 / 12) * 0.23 : (25_000_000 / 12) * 0.23))
  const band6 = round2((50_000_000 / 12) > m ? 0 : (m - 50_000_000 / 12) * 0.25)
  return round2(band1 + band2 + band3 + band4 + band5 + band6)
}

export interface TaxDataInput {
  monthlyGrossPay: number        // full monthly gross, incl. overtime & arrears
  monthlyPensionable: number     // Basic + Housing + Transport
  monthlyReimbursement: number   // Discretionary + Car + Entertainment + Data + Night (tax-exempt)
  monthlyNhf: number             // Basic × 2.5%
  monthlyVoluntaryPension: number
  monthlyInsurance: number
  lifeAssuranceAmount: number    // monthly premium (0 if none)
}

/**
 * Full tax derivation for one staff member, aligned with the payroll input
 * template ("Test_Payroll Input.xlsx").
 *
 * Template column mapping:
 *   Gross Pay (Z)            = SUM of all earnings (Basic → Arrears, incl. Overtime + Arrears)
 *   Reimbursement (AA)       = Discretionary + Car Subsidy + Entertainment + Data + Night
 *   NHF (AC)                 = Basic × 2.5%
 *   Employee Pension (AD)    = (Basic + Housing + Transport) × 8%
 *   Employer Pension (BA)    = (Basic + Housing + Transport) × 10%
 *   Rent Relief (BC)         = ₦500,000 / 12
 *   Total allowable (BD)     = Reimbursement + Life Assurance + NHF + Employee Pension
 *                              + Voluntary Pension + Insurance + Rent Relief
 *   Total taxable income (BE)= Gross Pay − Total allowable deduction
 *   PAYE (BL)                = progressive tax on Total taxable income
 */
export function deriveTaxData(input: TaxDataInput): {
  pensionEmployee: number
  pensionEmployer: number
  nhfMonthly: number
  rentRelief: number            // annual ₦500,000
  lifeAssuranceAmount: number   // monthly
  reimbursement: number         // monthly tax-exempt reimbursement
  annualGrossIncome: number
  annualPensionDeduction: number
  annualChargeableIncome: number
  annualPAYE: number
  monthlyPAYE: number
} {
  const {
    monthlyGrossPay,
    monthlyPensionable,
    monthlyReimbursement,
    monthlyNhf,
    monthlyVoluntaryPension,
    monthlyInsurance,
    lifeAssuranceAmount,
  } = input

  const pensionEmployeeFull = monthlyPensionable * PENSION_EMPLOYEE_RATE
  const pensionEmployerFull = monthlyPensionable * PENSION_EMPLOYER_RATE

  const rentReliefAnnual      = RENT_RELIEF                   // ₦500,000 / year
  const rentReliefMonthly     = rentReliefAnnual / 12         // ₦41,666.67 / month
  const lifeAssurance         = Math.max(0, lifeAssuranceAmount)
  const lifeAssuranceMonthly  = lifeAssurance                 // monthly premium (used directly)

  // Template "Total allowable deduction" = Reimbursement + Life Assurance + NHF
  // + Employee Pension + Voluntary Pension + Insurance + Rent Relief.
  const monthlyAllowableDeductions =
    monthlyReimbursement +
    lifeAssuranceMonthly +
    monthlyNhf +
    pensionEmployeeFull +
    monthlyVoluntaryPension +
    monthlyInsurance +
    rentReliefMonthly

  // Template "Total taxable income" = Gross Pay − Total allowable deduction.
  const monthlyChargeableIncome = Math.max(0, monthlyGrossPay - monthlyAllowableDeductions)

  // Per-band rounding (monthly), mirroring the template's ROUND(IF(…),2) cells.
  const monthlyPAYE = computeMonthlyPAYE(monthlyChargeableIncome)

  return {
    pensionEmployee: round2(pensionEmployeeFull),
    pensionEmployer: round2(pensionEmployerFull),
    nhfMonthly: round2(monthlyNhf),
    rentRelief: rentReliefAnnual,
    lifeAssuranceAmount: round2(lifeAssurance),
    reimbursement: round2(monthlyReimbursement),
    annualGrossIncome: round2(monthlyGrossPay * 12),
    annualPensionDeduction: round2(pensionEmployeeFull * 12),
    annualChargeableIncome: round2(monthlyChargeableIncome * 12),
    annualPAYE: round2(monthlyPAYE * 12),
    monthlyPAYE,
  }
}

export function getNhfMonthly(basicSalary: number): number {
  return round2(basicSalary * NHF_RATE)
}

// Returns the tax amount applied within each of the six NTA 2025 bands.
// Used to populate the band-breakdown columns in the review template.
export function computeTaxBandBreakdown(annualChargeableIncome: number): {
  band1: number  // ₦800k @ 0%
  band2: number  // next ₦2.2M @ 15%
  band3: number  // next ₦9M @ 18%
  band4: number  // next ₦13M @ 21%
  band5: number  // next ₦25M @ 23%
  band6: number  // above ₦50M @ 25%
} {
  const aci = Math.max(0, annualChargeableIncome)
  const band = (from: number, to: number, rate: number) =>
    round2(Math.min(Math.max(aci - from, 0), to - from) * rate)

  return {
    band1: band(0,          800_000,    0.00),
    band2: band(800_000,    3_000_000,  0.15),
    band3: band(3_000_000,  12_000_000, 0.18),
    band4: band(12_000_000, 25_000_000, 0.21),
    band5: band(25_000_000, 50_000_000, 0.23),
    band6: band(50_000_000, Infinity,   0.25),
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
