// src/app/lib/payroll/generation/field-resolver.ts
//
// Resolves one staff member's full payroll field set for a period, given
// their StaffPayrollProfile and the company's PayrollTemplateField[]. This
// is the auto-generation counterpart to a human filling in an Excel row —
// it produces the same per-field value shape the (untouched) manual upload
// path builds from a parsed spreadsheet cell, just computed instead of typed.
//
// Resolution runs in three passes, since PERCENTAGE/SYSTEM_CALC fields can
// reference other fields' already-resolved values:
//   1. Everything that isn't a formula — month (always the period being
//      generated), staff-record-derived identity fields, and both MANUAL and
//      FIXED_PROFILE fields (both check the Compensation Profile first, so a
//      saved value is reused every period regardless of which of the two a
//      field is nominally marked as; a MANUAL field with nothing saved just
//      stays blank like before)
//   2. PERCENTAGE (of a specific field, or of the running gross-earnings sum)
//   3. SYSTEM_CALC (named calculators, e.g. NIGERIA_PAYE_2025, which need
//      the fully-resolved gross + any already-resolved pension/NHF deduction)
import { calculateMonthlyPaye2025 } from './paye-calculator';
import { calculateBhtPercentage, calculateGrossPercentage, resolveRentFromBands, type RentBand } from './statutory-calculators';

// Per-template toggle governing the Pension/NSITF/ITF calculators only, see
// PayrollTemplate.pensionCalculationBase in schema.prisma. Does NOT affect
// NIGERIA_PAYE_2025 or PERCENTAGE-of-Gross-Earnings fields.
export type PensionCalculationBase = 'BHT' | 'STANDARD';

export type PayrollTemplateFieldLike = {
	systemField: string;
	displayName: string;
	dataType: string;
	section: string;
	required: boolean;
	showOnPayslip: boolean;
	order: number;
	valueSource: string; // 'MANUAL' | 'FIXED_PROFILE' | 'PERCENTAGE' | 'SYSTEM_CALC'
	formulaConfig: unknown;
};

export type PercentageFormulaConfig = {
	of: string; // a systemField, or the pseudo-reference 'GROSS_EARNINGS'
	percent: number;
	min?: number;
	max?: number;
};

export type SystemCalcFormulaConfig = {
	calculator: string; // one of SYSTEM_CALCULATOR_NAMES below
	pensionField?: string; // systemField of an already-resolved pension deduction, netted out of taxable income
	nhfField?: string; // systemField of an already-resolved NHF deduction, netted out of taxable income
	// NIGERIA_PAYE_2025 only — systemField of an already-resolved field
	// holding the staff's declared ANNUAL rent paid, used to compute the
	// Nigeria Tax Act 2025 rent relief. Left unset (or pointed at a blank
	// field) means the employee hasn't declared rent, which correctly
	// yields zero relief rather than an assumed amount.
	rentField?: string;
	// NIGERIA_PENSION_EMPLOYEE | NIGERIA_PENSION_EMPLOYER | NIGERIA_NSITF | NIGERIA_ITF only
	// — the three fields making up the pensionable base (Basic + Housing +
	// Transport, per the Pension Reform Act 2014's "monthly emolument").
	basicField?: string;
	housingField?: string;
	transportField?: string;
	// Percent override; defaults to the statutory minimum for the chosen
	// calculator (SYSTEM_CALC_DEFAULT_RATES) when unset.
	rate?: number;
	// Base-percentage calculators only: 'BHT' or 'GROSS' pins this field's
	// base regardless of the template's calculation base toggle (e.g.
	// Pension on BHT while NSITF/ITF run on Gross). Unset follows the toggle.
	base?: CalcBaseOverride | NhfBase;
	// NIGERIA_RENT_PAID_BANDS only: the "monthly gross from -> annual rent
	// paid" table, and the rent used when gross is below the first row.
	rentBands?: RentBand[];
	belowLowestRent?: number;
};

export const RENT_PAID_BANDS_CALCULATOR = 'NIGERIA_RENT_PAID_BANDS';
export const PAYE_CALCULATOR = 'NIGERIA_PAYE_2025';

export type CalcBaseOverride = 'BHT' | 'GROSS';

// National Housing Fund: an employee deduction, 2.5% of Basic by default
// (NHF Act), or a percentage of the prorated Gross when `base` is 'GROSS'.
export const NHF_CALCULATOR = 'NIGERIA_NHF';
export const NHF_DEFAULT_RATE = 2.5;
export type NhfBase = 'BASIC' | 'GROSS';
export const NHF_BASES: NhfBase[] = ['BASIC', 'GROSS'];
export const CALC_BASE_OVERRIDES: CalcBaseOverride[] = ['BHT', 'GROSS'];

// The base a base-percentage field actually uses: its own override when set,
// else the template-wide toggle.
export function effectiveCalcBase(config: { base?: unknown } | null | undefined, templateBase: PensionCalculationBase = 'BHT'): PensionCalculationBase {
	if (config?.base === 'GROSS') return 'STANDARD';
	if (config?.base === 'BHT') return 'BHT';
	return templateBase === 'STANDARD' ? 'STANDARD' : 'BHT';
}

// Order SYSTEM_CALC fields resolve in: Rent Paid bands first, PAYE last,
// everything else (pension, NHF, NSITF...) in template order between them.
// PAYE reads pension, NHF and rent, so it must see them resolved wherever
// HR placed it in the template.
export function systemCalcResolutionOrder<T extends { formulaConfig?: unknown }>(fields: T[]): T[] {
	const calcOf = (f: T) => (f.formulaConfig as SystemCalcFormulaConfig | null)?.calculator;
	const rank = (f: T) => (calcOf(f) === RENT_PAID_BANDS_CALCULATOR ? 0 : calcOf(f) === PAYE_CALCULATOR ? 2 : 1);
	return [...fields].sort((a, b) => rank(a) - rank(b));
}

// Calculators that are a flat percentage of the pensionable base (BHT) or,
// in STANDARD mode, of the standalone Gross. Default rates are the
// statutory ones; a field's `rate` overrides them.
export const SYSTEM_CALC_DEFAULT_RATES: Record<string, number> = {
	NIGERIA_PENSION_EMPLOYEE: 8,
	NIGERIA_PENSION_EMPLOYER: 10,
	NIGERIA_NSITF: 1,
	NIGERIA_ITF: 1,
};
export const BASE_PERCENTAGE_CALCULATORS = Object.keys(SYSTEM_CALC_DEFAULT_RATES);

export const SYSTEM_CALCULATOR_NAMES = ['NIGERIA_PAYE_2025', RENT_PAID_BANDS_CALCULATOR, NHF_CALCULATOR, ...BASE_PERCENTAGE_CALCULATORS];

// The single dispatch point for "what should this SYSTEM_CALC field's value
// be right now, given these inputs" — used both by Pass 3 below (fresh
// generation) and by the row-edit/draft-upload API routes (to check a
// manually-typed or re-uploaded value against the statutory calculation
// before accepting it, so a wrong PAYE/pension/NSITF figure gets flagged
// instead of silently saved). `getFieldValue` abstracts over whatever the
// caller's already-resolved field map looks like (a Map during generation,
// a plain object elsewhere) — always called with a already-resolved value,
// same latitude callers already have with the other passes.
export function computeSystemCalcValue(
	config: SystemCalcFormulaConfig,
	getFieldValue: (systemField: string) => unknown,
	grossEarningsSoFar: number,
	pensionCalculationBase: PensionCalculationBase = 'BHT'
): number {
	if (config.calculator === 'NIGERIA_PAYE_2025') {
		const pension = config.pensionField ? num(getFieldValue(config.pensionField)) : 0;
		const nhf = config.nhfField ? num(getFieldValue(config.nhfField)) : 0;
		// The rent field holds an ANNUAL figure (matching how a lease actually
		// states rent) but calculateMonthlyPaye2025 annualizes its rent
		// argument by ×12 internally (it expects a monthly figure) — divide
		// here so the relief comes out correct instead of 12x overstated for
		// anyone not already at the 500k cap.
		const rent = config.rentField ? num(getFieldValue(config.rentField)) / 12 : 0;
		return calculateMonthlyPaye2025(grossEarningsSoFar, pension, nhf, rent);
	}
	if (config.calculator === RENT_PAID_BANDS_CALCULATOR) {
		// Bands are picked by the month's prorated Gross (the standalone gross
		// is prorated in place before Pass 3). Templates without a standalone
		// gross fall back to the gross earnings resolved so far.
		const gross = num(getFieldValue(GROSS_SYSTEM_FIELD)) || grossEarningsSoFar;
		return resolveRentFromBands(gross, config.rentBands, num(config.belowLowestRent));
	}
	if (config.calculator === NHF_CALCULATOR) {
		const rate = typeof config.rate === 'number' ? config.rate : NHF_DEFAULT_RATE;
		const base = config.base === 'GROSS' ? num(getFieldValue(GROSS_SYSTEM_FIELD)) : config.basicField ? num(getFieldValue(config.basicField)) : 0;
		return calculateGrossPercentage(base, rate);
	}
	if (BASE_PERCENTAGE_CALCULATORS.includes(config.calculator)) {
		const defaultRate = SYSTEM_CALC_DEFAULT_RATES[config.calculator];
		const rate = typeof config.rate === 'number' ? config.rate : defaultRate;
		if (effectiveCalcBase(config, pensionCalculationBase) === 'STANDARD') {
			const gross = num(getFieldValue(GROSS_SYSTEM_FIELD));
			return calculateGrossPercentage(gross, rate);
		}
		const basic = config.basicField ? num(getFieldValue(config.basicField)) : 0;
		const housing = config.housingField ? num(getFieldValue(config.housingField)) : 0;
		const transport = config.transportField ? num(getFieldValue(config.transportField)) : 0;
		return calculateBhtPercentage(basic, housing, transport, rate);
	}
	return 0;
}

type ResolvedField = {
	systemField: string;
	displayName: string;
	dataType: string;
	section: string;
	required: boolean;
	showOnPayslip: boolean;
	value: number | string | null;
	source: 'PROFILE' | 'PERCENTAGE' | 'SYSTEM_CALC' | 'MANUAL' | 'STAFF_RECORD' | 'PERIOD' | 'LOAN';
	// Only set when source === 'PERCENTAGE' — carries the formula that
	// produced `value`, so a later edit can adjust the percent and
	// recompute the amount instead of overwriting the amount directly.
	percentageFormula?: PercentageFormulaConfig;
};

export type ResolveResult = {
	fields: ResolvedField[];
	needsReview: boolean; // true if any required field is still blank
	missingRequiredFields: string[]; // displayNames, for the "flagged" UI
};

// The staff-record fields a compulsory identity field can be derived from
// directly, instead of needing a redundant copy in StaffPayrollProfile.values.
export type StaffContextLike = {
	staffId: string;
	firstName: string;
	lastName: string;
	email: string;
	department: string | null;
};

// The period a run is being generated for — `month` is always this, never
// something typed per staff or stored on a profile, since every staff row
// in a single generation run shares the same pay period by definition.
// `workingDaysInAMonth` is likewise one number for the whole run (set once when HR
// starts generation, stored on PayrollGenerationRun), not a per-staff value
// — see the attendance-based proration below.
export type PeriodContextLike = {
	month: string;
	workingDaysInAMonth?: number | null;
};

// Fixed system field for the run-level "days in the month" figure — always
// resolved and always included in the output, regardless of whether the
// current template happens to declare a field for it. Unlike GROSS_SYSTEM_FIELD
// (a per-staff Compensation Profile value), this is deliberately NOT a
// template-configurable option: attendance-based proration applies to every
// payroll generated, the same way the compulsory identity fields always do.
export const DAYS_IN_MONTH_SYSTEM_FIELD = 'days_in_month';

// Fixed per-staff "days worked" figure — always resolved and always
// included in the output, the same way DAYS_IN_MONTH_SYSTEM_FIELD is, and
// for the same reason: leaving this as an arbitrary template-configurable
// field is exactly what let a naming mismatch (a template declaring
// `no_of_days_worked` instead of this key) silently turn proration into a
// no-op for an entire company. Sourced directly from the staff's
// Compensation Profile (`StaffPayrollProfile.values[days_worked]`), shown
// there as a fixed "Number of days worked" column alongside Gross. Blank
// defaults to the full days_in_month figure, so a staff member who isn't
// tracked here simply isn't prorated, which is a legitimate default, not an
// error state — this field is not marked `required` for that reason.
export const DAYS_WORKED_SYSTEM_FIELD = 'days_worked';
export const DAYS_WORKED_DISPLAY_NAME = 'Number of days worked';

// Fixed per-staff "loan repayment" deduction — Staff Loans & Benefits'
// Payroll Generation linkage. Unlike days_worked/days_in_month, this is only
// surfaced in the output (and thus only visible on the payslip) when the
// caller actually resolved a positive due amount for this staff member this
// run, following the same "only appended when actually relevant" pattern as
// the standalone Gross field below rather than the "always present" pattern
// days_worked/days_in_month use. Tagged DEDUCTIONS so finalize-generated-
// payroll.ts's existing section==='DEDUCTIONS' summing logic picks it up
// into totalDeductions/netPay with no changes needed there. The actual
// "which installment(s) are due this period" lookup lives in
// backend/src/app/lib/staff-loans-benefits/payroll-integration.ts — this
// file only knows about the already-resolved number handed to it.
export const LOAN_REPAYMENT_SYSTEM_FIELD = 'loan_repayment';
export const LOAN_REPAYMENT_DISPLAY_NAME = 'Loan Repayment';

function normalizeAttendanceFieldText(systemField: string, displayName: string): string {
	return `${systemField} ${displayName}`.toLowerCase().replace(/[^a-z]/g, '');
}

// Same idea as findDaysInMonthField below — mainly needed for backward
// compatibility with PayrollData rows generated before days_worked became a
// fixed, always-resolved key under a template's own arbitrarily-named
// field. Live resolution (below) never needs this: days_worked is always
// present by construction now. Exported for finalize-generated-payroll.ts's
// PDF-field detection, which does still need to handle that older data.
export function findDaysWorkedField(entries: Array<[string, { displayName: string }]>): string | null {
	const exact = entries.find(([systemField]) => systemField === DAYS_WORKED_SYSTEM_FIELD);
	if (exact) return exact[0];

	let best: string | null = null;
	let bestScore = 0;
	for (const [systemField, field] of entries) {
		const text = normalizeAttendanceFieldText(systemField, field.displayName);
		if (!text.includes('day')) continue;
		const hasMonth = text.includes('month');
		const hasWorked = text.includes('worked') || text.includes('working') || text.includes('present') || text.includes('attendance');
		if (hasWorked && !hasMonth) {
			const score = text.includes('daysworked') ? 3 : 1;
			if (score > bestScore) {
				bestScore = score;
				best = systemField;
			}
		}
	}
	return best;
}

// Same idea for "days in the month" — mainly needed for backward
// compatibility with PayrollData rows generated before days_in_month became
// a fixed, always-resolved key (a run generated then, never recomputed
// since). Live resolution (below) never needs this: days_in_month is always
// present by construction. Exported for finalize-generated-payroll.ts's
// PDF-field detection, which does still need to handle that older data.
export function findDaysInMonthField(entries: Array<[string, { displayName: string }]>): string | null {
	const exact = entries.find(([systemField]) => systemField === DAYS_IN_MONTH_SYSTEM_FIELD);
	if (exact) return exact[0];

	let best: string | null = null;
	let bestScore = 0;
	for (const [systemField, field] of entries) {
		const text = normalizeAttendanceFieldText(systemField, field.displayName);
		if (!text.includes('day')) continue;
		const hasMonth = text.includes('month');
		const hasWorked = text.includes('worked') || text.includes('working') || text.includes('present') || text.includes('attendance');
		if (hasMonth && !hasWorked) {
			const score = text.includes('inamonth') || text.includes('inthemonth') || text.includes('inmonth') || text.includes('ofmonth') ? 3 : 1;
			if (score > bestScore) {
				bestScore = score;
				best = systemField;
			}
		}
	}
	return best;
}

// Compulsory identity fields (Staff ID, Name, Email, Department) already
// live on the staff record itself. Resolved straight from the staff record
// rather than requiring HR to duplicate them into the compensation profile —
// which would otherwise silently go stale the moment someone edits the
// staff's name in Staff Management without remembering to also update their
// compensation profile. Keyed by the fixed, uneditable systemField names the
// template builder enforces for compulsory fields.
const STAFF_RECORD_DERIVED_FIELDS: Record<string, (staff: StaffContextLike) => string> = {
	staff_id: (staff) => staff.staffId,
	employee_name: (staff) => `${staff.firstName} ${staff.lastName}`.trim(),
	employee_email: (staff) => staff.email,
	department: (staff) => staff.department || ''
};

// Exported so the Compensation Profile UI/upload routes can exclude these
// systemFields from what they ask HR to fill in — editing them there would
// be pointless once a field resolves straight from the staff record instead.
export const STAFF_RECORD_DERIVED_SYSTEM_FIELDS: string[] = Object.keys(STAFF_RECORD_DERIVED_FIELDS);

// The compulsory "Month" field is always the pay period a run is generated
// for — it's what "Generate for August 2026" means, not a value that
// varies per staff or needs storing anywhere. `days_in_month` joins it here
// for the same reason (see DAYS_IN_MONTH_SYSTEM_FIELD above): it's always
// resolved from periodContext.workingDaysInAMonth, a calendar fact about
// the pay period itself, never a value HR enters or corrects per staff.
// Exported for the same reason as STAFF_RECORD_DERIVED_SYSTEM_FIELDS above:
// so the Compensation Profile UI/upload routes never ask HR to fill it in,
// and the Payroll Generation review page's row-edit/draft-upload routes
// never let it be overwritten either.
export const PERIOD_DERIVED_SYSTEM_FIELDS: string[] = ['month', DAYS_IN_MONTH_SYSTEM_FIELD];

// Exported so the Compensation overview route can compute a live
// "Gross Earnings" preview the same way generation itself sums earnings
// fields. Not to be confused with GROSS_SYSTEM_FIELD below — that's a
// standalone, directly-entered figure, not a sum of anything.
export function isEarningsSection(section: string): boolean {
	return /EARNING/i.test(section || '');
}

// "Gross" as a standalone, directly-entered figure in Staff Compensation —
// not a computed sum of other fields (that's GROSS_EARNINGS/isEarningsSection
// above). Always available as a PERCENTAGE `of` target regardless of
// whether the current template happens to declare a field for it, so a
// company can define e.g. "Pension = 8% of Gross" without needing a
// matching template field at all. Exported so the Compensation Profile
// UI/upload routes always offer it, and so the template builder's
// percentage-of dropdown always lists it.
export const GROSS_SYSTEM_FIELD = 'gross';

function num(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

// Re-derives a PERCENTAGE field's base ("of") from an already-resolved data
// map — same lookup rule generation itself uses (Pass 2 above), just
// callable afterward against stored PayrollData.data. Used when an edit
// changes a percentage instead of the amount directly, so the new amount is
// computed the same way a fresh generation would.
export function resolvePercentageBase(data: Record<string, { value: unknown; section: string }>, of: string): number {
	if (of === 'GROSS_EARNINGS') {
		return Object.values(data)
			.filter((f) => isEarningsSection(f.section) && typeof f.value === 'number')
			.reduce((sum, f) => sum + (f.value as number), 0);
	}
	return num(data[of]?.value);
}

export function resolveStaffPayrollFields(
	fields: PayrollTemplateFieldLike[],
	profileValues: Record<string, unknown> | null | undefined,
	staffContext?: StaffContextLike,
	periodContext?: PeriodContextLike,
	loanRepaymentAmount?: number | null,
	pensionCalculationBase: PensionCalculationBase = 'BHT'
): ResolveResult {
	const ordered = [...fields].sort((a, b) => a.order - b.order);
	const resolvedByField = new Map<string, ResolvedField>();

	// Seed the standalone Gross figure up front — before any real template
	// field is resolved — so it's available as a PERCENTAGE `of` target via
	// the same generic systemField lookup every other field reference uses,
	// with no special-casing needed in Pass 2. If a template also happens to
	// declare a real field with this systemField, the loop below overwrites
	// this with that field's own resolution (harmless — same value either way).
	const grossRaw = profileValues?.[GROSS_SYSTEM_FIELD];
	const grossIsEmpty = grossRaw === undefined || grossRaw === null || grossRaw === '';
	resolvedByField.set(GROSS_SYSTEM_FIELD, {
		systemField: GROSS_SYSTEM_FIELD,
		displayName: 'Gross',
		dataType: 'Number',
		section: 'FIXED_VALUES',
		required: false,
		showOnPayslip: false,
		value: grossIsEmpty ? null : num(grossRaw),
		source: 'PROFILE'
	});

	// Pass 1 — everything except PERCENTAGE/SYSTEM_CALC formulas
	for (const field of ordered) {
		if (field.valueSource === 'PERCENTAGE' || field.valueSource === 'SYSTEM_CALC') {
			// placeholder — filled in passes 2/3 below, kept out of pass 1 so
			// dependency lookups (`of`) only ever see already-final values.
			continue;
		}

		const base = {
			systemField: field.systemField,
			displayName: field.displayName,
			dataType: field.dataType,
			section: field.section,
			required: field.required,
			showOnPayslip: field.showOnPayslip
		};

		if (PERIOD_DERIVED_SYSTEM_FIELDS.includes(field.systemField)) {
			resolvedByField.set(field.systemField, { ...base, value: periodContext?.month ?? null, source: 'PERIOD' });
			continue;
		}

		const deriveFromStaffRecord = STAFF_RECORD_DERIVED_FIELDS[field.systemField];
		if (deriveFromStaffRecord && staffContext) {
			const derived = deriveFromStaffRecord(staffContext);
			resolvedByField.set(field.systemField, { ...base, value: derived === '' ? null : derived, source: 'STAFF_RECORD' });
			continue;
		}

		// MANUAL and FIXED_PROFILE both check the compensation profile first —
		// a saved value is reused every period either way. A MANUAL field with
		// nothing saved there just stays blank, exactly like before.
		const raw = profileValues?.[field.systemField];
		const isEmpty = raw === undefined || raw === null || raw === '';
		const value: number | string | null = isEmpty ? null : field.dataType === 'Number' ? num(raw) : String(raw);
		resolvedByField.set(field.systemField, { ...base, value, source: isEmpty ? 'MANUAL' : 'PROFILE' });
	}

	// Attendance-based proration — fixed, always applied for every run that
	// has a days-in-month figure (every run started after this feature
	// shipped; older runs simply skip it), not a template-level toggle like
	// GROSS_SYSTEM_FIELD above is. Runs after Pass 1 (so any legacy
	// template-declared field sharing one of these two systemFields is
	// overwritten by the fixed value below, exactly like GROSS_SYSTEM_FIELD's
	// own seed above) and before Pass 2/3, so every PERCENTAGE/SYSTEM_CALC
	// field downstream sees the already-prorated "gross" the same way it
	// would see any other resolved value.
	const workingDaysInAMonth = periodContext?.workingDaysInAMonth && periodContext.workingDaysInAMonth > 0 ? periodContext.workingDaysInAMonth : null;
	resolvedByField.set(DAYS_IN_MONTH_SYSTEM_FIELD, {
		systemField: DAYS_IN_MONTH_SYSTEM_FIELD,
		displayName: 'Working Days in Month',
		dataType: 'Days',
		section: 'ATTENDANCE',
		required: true,
		showOnPayslip: true,
		value: workingDaysInAMonth,
		source: 'PERIOD'
	});

	// Fixed, sourced directly from the Compensation Profile — not looked up
	// via findDaysWorkedField's heuristic, which now exists purely for
	// backward compatibility with historical PayrollData (see its comment).
	const daysWorkedRaw = profileValues?.[DAYS_WORKED_SYSTEM_FIELD];
	const daysWorkedIsEmpty = daysWorkedRaw === undefined || daysWorkedRaw === null || daysWorkedRaw === '';
	resolvedByField.set(DAYS_WORKED_SYSTEM_FIELD, {
		systemField: DAYS_WORKED_SYSTEM_FIELD,
		displayName: DAYS_WORKED_DISPLAY_NAME,
		dataType: 'Days',
		section: 'ATTENDANCE',
		required: false,
		showOnPayslip: true,
		value: daysWorkedIsEmpty ? null : num(daysWorkedRaw),
		source: 'PROFILE'
	});

	// Loan repayment — fixed, seeded outside the ordinary valueSource passes,
	// same mechanism as days_worked above (see LOAN_REPAYMENT_SYSTEM_FIELD's
	// comment). `loanRepaymentAmount` is resolved by the caller (the
	// generation loop) before this function runs, from that staff member's
	// LoanInstallment rows due this run's target month.
	const loanDue = loanRepaymentAmount && loanRepaymentAmount > 0 ? Math.round(loanRepaymentAmount * 100) / 100 : null;
	resolvedByField.set(LOAN_REPAYMENT_SYSTEM_FIELD, {
		systemField: LOAN_REPAYMENT_SYSTEM_FIELD,
		displayName: LOAN_REPAYMENT_DISPLAY_NAME,
		dataType: 'Number',
		section: 'DEDUCTIONS',
		required: false,
		showOnPayslip: true,
		value: loanDue,
		source: 'LOAN'
	});

	if (workingDaysInAMonth) {
		const daysWorked = daysWorkedIsEmpty ? workingDaysInAMonth : num(daysWorkedRaw);
		const grossField = resolvedByField.get(GROSS_SYSTEM_FIELD);
		if (grossField && typeof grossField.value === 'number') {
			const proratedGross = Math.round(((grossField.value / workingDaysInAMonth) * daysWorked) * 100) / 100;
			resolvedByField.set(GROSS_SYSTEM_FIELD, { ...grossField, value: proratedGross });
		}
	}

	const grossEarningsSoFar = () =>
		Array.from(resolvedByField.values())
			.filter((r) => isEarningsSection(r.section) && typeof r.value === 'number')
			.reduce((sum, r) => sum + (r.value as number), 0);

	// Pass 2 — PERCENTAGE
	for (const field of ordered) {
		if (field.valueSource !== 'PERCENTAGE') continue;
		const config = (field.formulaConfig || {}) as PercentageFormulaConfig;
		const base = config.of === 'GROSS_EARNINGS' ? grossEarningsSoFar() : num(resolvedByField.get(config.of)?.value);
		let value = (base * num(config.percent)) / 100;
		if (typeof config.min === 'number') value = Math.max(config.min, value);
		if (typeof config.max === 'number') value = Math.min(config.max, value);
		resolvedByField.set(field.systemField, {
			systemField: field.systemField,
			displayName: field.displayName,
			dataType: field.dataType,
			section: field.section,
			required: field.required,
			showOnPayslip: field.showOnPayslip,
			value: Math.round(value * 100) / 100,
			source: 'PERCENTAGE',
			percentageFormula: config
		});
	}

	// Pass 3 — SYSTEM_CALC (named calculators; both PAYE variants net out any
	// already-resolved pension/NHF deduction fields they're told about).
	// Rent Paid bands resolve first and PAYE last, so PAYE always sees the
	// rent, pension and NHF it nets out, wherever HR placed the fields.
	for (const field of systemCalcResolutionOrder(ordered.filter((f) => f.valueSource === 'SYSTEM_CALC'))) {
		if (field.valueSource !== 'SYSTEM_CALC') continue;
		const config = (field.formulaConfig || {}) as SystemCalcFormulaConfig;
		const value = computeSystemCalcValue(config, (sf) => resolvedByField.get(sf)?.value, grossEarningsSoFar(), pensionCalculationBase);
		resolvedByField.set(field.systemField, {
			systemField: field.systemField,
			displayName: field.displayName,
			dataType: field.dataType,
			section: field.section,
			required: field.required,
			showOnPayslip: field.showOnPayslip,
			value,
			source: 'SYSTEM_CALC'
		});
	}

	const resolved = ordered.map((f) => resolvedByField.get(f.systemField)!).filter(Boolean);

	// days_in_month is a fixed, run-level concept, always included regardless
	// of whether the current template happens to declare a field for it,
	// exactly like GROSS_SYSTEM_FIELD is always available as a PERCENTAGE
	// `of` target without needing a matching template field. Only add it if
	// the template hasn't already declared its own field with this
	// systemField (in which case the loop above already included it in
	// `resolved`, from the same resolvedByField entry).
	if (!resolved.some((f) => f.systemField === DAYS_IN_MONTH_SYSTEM_FIELD)) {
		resolved.push(resolvedByField.get(DAYS_IN_MONTH_SYSTEM_FIELD)!);
	}

	// days_worked is fixed the same way, and for the same reason — see its
	// constant comment above. Pushed immediately after days_in_month so the
	// two attendance columns land next to each other in the review table.
	if (!resolved.some((f) => f.systemField === DAYS_WORKED_SYSTEM_FIELD)) {
		resolved.push(resolvedByField.get(DAYS_WORKED_SYSTEM_FIELD)!);
	}

	// Unlike days_in_month, the standalone Gross figure stays genuinely
	// optional (a template that only ever uses GROSS_EARNINGS never needs
	// it), so it's only surfaced in the output, and thus visible in the
	// review table, when this template actually has a PERCENTAGE field
	// pointed at it. Otherwise it'd show as an unexplained extra column with
	// no field referencing it.
	//
	// Deliberately the LAST thing appended to `resolved` (not just
	// incidentally last): the review table renders every entry in `resolved`
	// as its own column, in order, then appends the fixed Gross Pay / Total
	// Deductions / Net Salary summary columns after that. Pushing Gross last
	// here is what guarantees it always lands immediately before that
	// summary block, keep any future addition to `resolved` above this line,
	// not below it.
	const referencesStandaloneGross = ordered.some((f) => f.valueSource === 'PERCENTAGE' && (f.formulaConfig as PercentageFormulaConfig | null)?.of === GROSS_SYSTEM_FIELD);
	// In Standard mode, Pension/NSITF/ITF compute off Gross too, and Rent
	// Paid bands always look Gross up. Surface it as a resolved column the
	// same way a PERCENTAGE-of-Gross field would, so the Excel export (which
	// derives its column list from resolved output, not template config) can
	// reference it for a live formula.
	const pensionNsitfUsesStandardGross = ordered.some((f) => {
		if (f.valueSource !== 'SYSTEM_CALC') return false;
		const calculator = (f.formulaConfig as SystemCalcFormulaConfig | null)?.calculator || '';
		return (
			calculator === RENT_PAID_BANDS_CALCULATOR ||
			(calculator === NHF_CALCULATOR && (f.formulaConfig as SystemCalcFormulaConfig | null)?.base === 'GROSS') ||
			(BASE_PERCENTAGE_CALCULATORS.includes(calculator) && effectiveCalcBase(f.formulaConfig as SystemCalcFormulaConfig | null, pensionCalculationBase) === 'STANDARD')
		);
	});
	if ((referencesStandaloneGross || pensionNsitfUsesStandardGross) && !resolved.some((f) => f.systemField === GROSS_SYSTEM_FIELD)) {
		const grossField = resolvedByField.get(GROSS_SYSTEM_FIELD)!;
		resolved.push({ ...grossField, showOnPayslip: true });
	}

	// Loan repayment only appears on the payslip when there's actually
	// something due this run — an unconditional always-present column (like
	// days_worked/days_in_month) would be a confusing "Loan Repayment: 0" row
	// for every staff member without an active loan.
	if (loanDue !== null && !resolved.some((f) => f.systemField === LOAN_REPAYMENT_SYSTEM_FIELD)) {
		resolved.push(resolvedByField.get(LOAN_REPAYMENT_SYSTEM_FIELD)!);
	}

	const missingRequiredFields = resolved.filter((r) => r.required && (r.value === null || r.value === '')).map((r) => r.displayName);

	return {
		fields: resolved,
		needsReview: missingRequiredFields.length > 0,
		missingRequiredFields
	};
}

// ---------------------------------------------------------------------------
// Re-deriving a draft row after HR edits it (review-table inline edit or a
// draft re-upload). Generation resolves everything once; without this, an
// edit to an input (days worked, a manual earning, a percentage) left every
// figure derived from it (prorated Gross, percentage fields, Rent Paid,
// PAYE, Pension, NSITF, ITF) stale until the run was regenerated.
//
// Mirrors resolveStaffPayrollFields' order exactly:
//   1. Re-prorate Gross from the Compensation Profile's raw gross when days
//      worked changed (and HR didn't also type a Gross in the same edit).
//   2. PERCENTAGE fields in template order, using the row's stored percent
//      (a percent edited on the review page wins over the template's).
//      Fields HR overwrote with a flat amount (source MANUAL_EDIT) keep it.
//   3. SYSTEM_CALC fields, Rent Paid bands first, then template order.
// A derived field not yet re-resolved reads as empty, exactly like a field
// generation hasn't reached yet, so the result matches a fresh generation
// of the same inputs.
export type StoredRowField = {
	value: unknown;
	displayName: string;
	dataType: string;
	section: string;
	required: boolean;
	showOnPayslip: boolean;
	source?: string;
	percentageFormula?: PercentageFormulaConfig;
};

export function recomputeRowDerivedFields(
	data: Record<string, StoredRowField>,
	templateFields: PayrollTemplateFieldLike[],
	options: {
		pensionCalculationBase?: PensionCalculationBase;
		workingDaysInAMonth?: number | null;
		rawGross?: number | null;
		reprorateGross?: boolean;
	} = {}
): Record<string, StoredRowField> {
	const out: Record<string, StoredRowField> = { ...data };
	const ordered = [...templateFields].sort((a, b) => a.order - b.order);
	const round2 = (n: number) => Math.round(n * 100) / 100;

	// 1. Proration. Gross isn't always a visible column, so keep the figure
	// for lookups even when the row doesn't store it.
	const dim = options.workingDaysInAMonth && options.workingDaysInAMonth > 0 ? options.workingDaysInAMonth : num(out[DAYS_IN_MONTH_SYSTEM_FIELD]?.value) || null;
	let grossLookup: number | null = typeof out[GROSS_SYSTEM_FIELD]?.value === 'number' ? (out[GROSS_SYSTEM_FIELD].value as number) : null;
	if (options.reprorateGross && dim && options.rawGross !== null && options.rawGross !== undefined) {
		const dwRaw = out[DAYS_WORKED_SYSTEM_FIELD]?.value;
		const daysWorked = dwRaw === null || dwRaw === undefined || dwRaw === '' ? dim : num(dwRaw);
		grossLookup = round2((options.rawGross / dim) * daysWorked);
		if (out[GROSS_SYSTEM_FIELD]) out[GROSS_SYSTEM_FIELD] = { ...out[GROSS_SYSTEM_FIELD], value: grossLookup };
	} else if (grossLookup === null && options.rawGross !== null && options.rawGross !== undefined) {
		const dwRaw = out[DAYS_WORKED_SYSTEM_FIELD]?.value;
		grossLookup = dim ? round2((options.rawGross / dim) * (dwRaw === null || dwRaw === undefined || dwRaw === '' ? dim : num(dwRaw))) : options.rawGross;
	}

	const isDerived = (f: PayrollTemplateFieldLike) =>
		!!out[f.systemField] && ((f.valueSource === 'PERCENTAGE' && out[f.systemField].source !== 'MANUAL_EDIT') || f.valueSource === 'SYSTEM_CALC');
	const pending = new Set(ordered.filter(isDerived).map((f) => f.systemField));
	const valueOf = (systemField: string): unknown => {
		if (pending.has(systemField)) return undefined;
		if (systemField === GROSS_SYSTEM_FIELD) return grossLookup;
		return out[systemField]?.value;
	};
	const earningsSoFar = () =>
		Object.entries(out)
			.filter(([sf, f]) => !pending.has(sf) && isEarningsSection(f.section) && typeof f.value === 'number')
			.reduce((sum, [, f]) => sum + (f.value as number), 0);

	// 2. PERCENTAGE
	for (const field of ordered) {
		if (field.valueSource !== 'PERCENTAGE' || !pending.has(field.systemField)) continue;
		const stored = out[field.systemField];
		const formula = (stored.percentageFormula || field.formulaConfig || {}) as PercentageFormulaConfig;
		const base = formula.of === 'GROSS_EARNINGS' ? earningsSoFar() : num(valueOf(formula.of));
		let value = (base * num(formula.percent)) / 100;
		if (typeof formula.min === 'number') value = Math.max(formula.min, value);
		if (typeof formula.max === 'number') value = Math.min(formula.max, value);
		out[field.systemField] = { ...stored, value: round2(value) };
		pending.delete(field.systemField);
	}

	// 3. SYSTEM_CALC, Rent Paid bands first and PAYE last (see Pass 3 in resolveStaffPayrollFields).
	for (const field of systemCalcResolutionOrder(ordered.filter((f) => f.valueSource === 'SYSTEM_CALC' && pending.has(f.systemField)))) {
		const config = (field.formulaConfig || {}) as SystemCalcFormulaConfig;
		const value = computeSystemCalcValue(config, valueOf, earningsSoFar(), options.pensionCalculationBase || 'BHT');
		out[field.systemField] = { ...out[field.systemField], value, source: 'SYSTEM_CALC' };
		pending.delete(field.systemField);
	}

	return out;
}

// ---------------------------------------------------------------------------
// Column order for the review table and the Excel export: the order HR laid
// the fields out in the template builder (its section sequence, then each
// field's position within its section). Stored row data can't be relied on
// for this, since Postgres JSONB doesn't keep key order. This is display
// order only; resolution keeps using the saved `order` values.
export const BUILDER_SECTION_ORDER = ['STAFF_DETAILS', 'FIXED_EARNINGS', 'EARNINGS', 'DEDUCTIONS', 'FIXED_VALUES', 'EMPLOYER_COST'];

export function templateFieldDisplayRank(fields: Array<{ systemField: string; section: string; order: number }>): Map<string, number> {
	const sectionIndex = (section: string) => {
		const key = (section || '').toUpperCase().replace(/[\s-]+/g, '_');
		const i = BUILDER_SECTION_ORDER.indexOf(key);
		return i === -1 ? BUILDER_SECTION_ORDER.length : i;
	};
	const sorted = [...fields].sort((a, b) => sectionIndex(a.section) - sectionIndex(b.section) || a.order - b.order);
	return new Map(sorted.map((f, i) => [f.systemField, i]));
}

// Stable sort of anything carrying a systemField into builder order; items
// that aren't template fields keep their relative order after the rest.
export function sortByTemplateOrder<T extends { systemField: string }>(items: T[], rank: Map<string, number>): T[] {
	return items
		.map((item, i) => ({ item, i, r: rank.has(item.systemField) ? (rank.get(item.systemField) as number) : Number.MAX_SAFE_INTEGER }))
		.sort((a, b) => a.r - b.r || a.i - b.i)
		.map(({ item }) => item);
}
