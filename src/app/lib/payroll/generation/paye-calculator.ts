// src/app/lib/payroll/generation/paye-calculator.ts
//
// Nigeria PAYE (Pay As You Earn) tax calculator — Nigeria Tax Act 2025 only.
// The previous 2020 Finance Act calculator (consolidated relief allowance,
// older six-band table) has been removed: confirmed via a live-data check
// that no PayrollTemplateField anywhere had ever been configured with it,
// so nothing depended on the old bands staying reachable. If a company ever
// genuinely needs to run payroll for a pre-2026 period the 2020 law
// applied to, reintroduce it as a separate, explicitly-dated calculator
// rather than reviving this one — don't silently backdate 2025 math onto
// old periods. Standard-law implementation, not a company-specific one,
// spot-check it against your own tax advisor before relying on it for
// compliance filings. Offered as an opt-in SYSTEM_CALC preset on a
// PayrollTemplateField (calculator: 'NIGERIA_PAYE_2025'); nothing in the
// (untouched) manual upload path calls it.
//
// Reference (Nigeria Tax Act 2025, signed June 2025, effective 1 January 2026):
//   Consolidated Relief Allowance is abolished outright — no CRA deduction
//     of any kind.
//   Rent Relief (new) = min(20% of annual rent paid, 500,000), and only
//     applies if the employee has actually declared rent paid, an
//     undeclared/zero rent means zero relief, not an assumed value.
//   Pension, NHF and NHIS employee contributions remain deductible from
//     gross before tax.
//   Taxable income = gross annual income minus annual pension minus annual
//     NHF minus annual other pre-tax deductions minus rent relief
//   Progressive bands applied to taxable income:
//     first    800,000 @  0%
//     next   2,200,000 @ 15%
//     next   9,000,000 @ 18%
//     next  13,000,000 @ 21%
//     next  25,000,000 @ 23%
//     remainder         @ 25%

type PayeBand = { upTo: number | null; rate: number };

// Exported for the payroll workbook download: the approved-run export embeds
// the progressive-band computation as a live Excel formula (see the
// formula-embedding block in generate/[runId]/download/route.ts), which needs
// the same thresholds/rates the calculator itself iterates over.
export const NIGERIA_PAYE_2025_BANDS: PayeBand[] = [
	{ upTo: 800_000, rate: 0 },
	{ upTo: 3_000_000, rate: 0.15 },
	{ upTo: 12_000_000, rate: 0.18 },
	{ upTo: 25_000_000, rate: 0.21 },
	{ upTo: 50_000_000, rate: 0.23 },
	{ upTo: null, rate: 0.25 },
];

const RENT_RELIEF_RATE = 0.2;
const RENT_RELIEF_CAP = 500_000;

// Exported for the payroll workbook download, which surfaces a per-staff
// Rent Relief column showing the relief actually applied inside the PAYE
// computation.
export function calculateRentRelief(annualRentPaid: number): number {
	if (annualRentPaid <= 0) return 0;
	return Math.min(annualRentPaid * RENT_RELIEF_RATE, RENT_RELIEF_CAP);
}

function calculateAnnualPaye2025(annualGrossIncome: number, annualPension = 0, annualNhf = 0, annualRentPaid = 0, annualOtherPreTaxDeductions = 0): number {
	if (annualGrossIncome <= 0) return 0;

	const rentRelief = calculateRentRelief(annualRentPaid);
	const taxableIncome = Math.max(0, annualGrossIncome - annualPension - annualNhf - rentRelief - annualOtherPreTaxDeductions);

	let remaining = taxableIncome;
	let previousThreshold = 0;
	let tax = 0;

	for (const band of NIGERIA_PAYE_2025_BANDS) {
		const bandCeiling = band.upTo === null ? Infinity : band.upTo;
		const bandSize = bandCeiling - previousThreshold;
		const taxableInBand = Math.min(remaining, bandSize);
		if (taxableInBand <= 0) break;
		tax += taxableInBand * band.rate;
		remaining -= taxableInBand;
		previousThreshold = bandCeiling;
		if (remaining <= 0) break;
	}

	return Math.round(tax * 100) / 100;
}

// Annualizes the monthly figures x12, computes the annual PAYE via the
// progressive bands above, then divides back down to a monthly deduction —
// standard Nigerian payroll practice, since the 0%/tax-free band and every
// threshold above it are legally annual amounts, not monthly ones.
// `monthlyRentPaid` is 0 when the employee hasn't declared rent, which
// correctly yields zero rent relief rather than an assumed amount.
export function calculateMonthlyPaye2025(
	monthlyGrossIncome: number,
	monthlyPension = 0,
	monthlyNhf = 0,
	monthlyRentPaid = 0,
	monthlyOtherPreTaxDeductions = 0
): number {
	const annualPaye = calculateAnnualPaye2025(
		monthlyGrossIncome * 12,
		monthlyPension * 12,
		monthlyNhf * 12,
		monthlyRentPaid * 12,
		monthlyOtherPreTaxDeductions * 12
	);
	return Math.round((annualPaye / 12) * 100) / 100;
}
