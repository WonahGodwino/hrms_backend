// src/app/lib/payroll/generation/statutory-calculators.ts
//
// Nigeria statutory employer/employee contributions computed on the
// pensionable base — Basic + Housing + Transport (BHT), per the Pension
// Reform Act 2014's definition of "monthly emolument". Employee pension
// (8%), employer pension (10%), and NSITF (1%, Employees' Compensation
// Act 2010) all share the exact same base and shape, differing only by
// rate — one function covers all three, called with a different default
// rate per SYSTEM_CALC calculator in field-resolver.ts.
//
// Standard-law default rates, not company-specific ones; a template can
// override the rate per field (see `rate` in SystemCalcFormulaConfig).

export function calculateBhtPercentage(basic: number, housing: number, transport: number, ratePercent: number): number {
	const base = (basic || 0) + (housing || 0) + (transport || 0);
	return Math.round(base * (ratePercent / 100) * 100) / 100;
}

// "Standard" calculation base — an opt-in alternative to BHT for companies
// that don't break pay into Basic/Housing/Transport components. Computed on
// the standalone Gross figure (GROSS_SYSTEM_FIELD) instead.
export function calculateGrossPercentage(gross: number, ratePercent: number): number {
	return Math.round((gross || 0) * (ratePercent / 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Rent Paid from a gross band table (NIGERIA_RENT_PAID_BANDS calculator).
//
// Some companies don't collect each staff member's actual rent, so the
// template defines a table instead: "a monthly gross from X means an annual
// rent paid of Y". The resolved figure is ANNUAL rent, the same unit the
// PAYE calculator's `rentField` already expects, so it feeds the Nigeria Tax
// Act 2025 rent relief (20% of rent, capped at 500,000) unchanged.
//
// Lookup rule: step up to the row at or below the gross (250k uses the 200k
// row). Above the last row the last row applies, which is what makes it the
// cap. Below the first row the template's `belowLowestRent` applies
// (default 0, meaning no relief).

export type RentBand = { minGross: number; annualRent: number };

// The default table shipped with the calculator (CFO-provided). HR edits it
// per template; this is only the starting point the builder pre-fills.
export const DEFAULT_RENT_BANDS: RentBand[] = [
	{ minGross: 200_000, annualRent: 500_000 },
	{ minGross: 300_000, annualRent: 700_000 },
	{ minGross: 500_000, annualRent: 1_500_000 },
	{ minGross: 600_000, annualRent: 2_500_000 },
];

export function resolveRentFromBands(monthlyGross: number, bands: RentBand[] | null | undefined, belowLowestRent = 0): number {
	const table = (Array.isArray(bands) && bands.length ? bands : DEFAULT_RENT_BANDS)
		.filter((b) => Number.isFinite(Number(b?.minGross)) && Number.isFinite(Number(b?.annualRent)))
		.map((b) => ({ minGross: Number(b.minGross), annualRent: Number(b.annualRent) }))
		.sort((a, b) => a.minGross - b.minGross);
	const gross = Number.isFinite(monthlyGross) ? monthlyGross : 0;
	let rent = Number.isFinite(belowLowestRent) && belowLowestRent > 0 ? belowLowestRent : 0;
	for (const band of table) {
		if (gross >= band.minGross) rent = band.annualRent;
		else break;
	}
	return Math.round(rent * 100) / 100;
}
