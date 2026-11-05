// src/app/lib/payroll/reports/statutory-schedule.ts
//
// NSITF, ITF and NHF for the Finance Report's statutory tab:
//  - buildStatutorySchedule: one payroll run (upload or generation run), one
//    row per staff with each scheme's amount and whether it was covered.
//  - buildStatutoryTrend: month by month totals for the last N months.
//  - getStaffStatutoryHistory / getCompanyStatutoryGaps: coverage tracking,
//    the same idea as the pension compliance timeline. A month is "skipped"
//    for a scheme when the scheme was in force for that payroll but the
//    staff member's amount is 0 or empty.
//
// "In force" for a payroll row: its template calculates or carries the
// scheme (see statutory-columns.ts), or another staff member in the same
// company and month has an amount for it (covers fixed upload templates).
// A scheme that isn't in force is "not tracked" and never flagged, so a
// company that doesn't use NHF is not flagged for NHF.
import { prisma } from '@/app/lib/db';
import { monthNameToNumber } from '@/app/lib/payroll/utils/valueParsing';
import { toNumber } from '@/app/lib/payroll/reports/bank-schedule';
import type { BankScheduleSourceType } from '@/app/lib/payroll/reports/bank-schedule';
import { resolvePayrollSource } from '@/app/lib/payroll/reports/source-scope';
import { STATUTORY_SCHEMES, statutorySchemesOnTemplate, type StatutoryScheme } from '@/app/lib/payroll/statutory-columns';

export type CoverageStatus = 'covered' | 'skipped' | 'not_tracked';
export type SchemeAmounts = Record<StatutoryScheme, number>;
export type SchemeStatuses = Record<StatutoryScheme, CoverageStatus>;

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const monthIndexOf = (month: unknown, year: number) => year * 12 + (monthNameToNumber(month) || 1);
const fromMonthIndex = (index: number) => {
	const zero = index - 1;
	return { year: Math.floor(zero / 12), monthNumber: (zero % 12) + 1 };
};
const round2 = (n: number) => Math.round(n * 100) / 100;

type StatutoryPayrollRow = {
	id: string;
	companyId: string;
	staffRecordId: string;
	month: string;
	year: number;
	templateId: string | null;
	createdAt: Date;
	nsitf: unknown;
	itf: unknown;
	nhf: unknown;
	grossPay?: unknown;
	finalGross?: unknown;
	proratedGrossPay?: unknown;
	basicSalary?: unknown;
	customFields?: unknown;
};

const amountsOf = (row: StatutoryPayrollRow): SchemeAmounts => ({ nsitf: toNumber(row.nsitf), itf: toNumber(row.itf), nhf: toNumber(row.nhf) });

/** Pure: classify one row given the schemes in force for it. */
export function coverageFor(amounts: SchemeAmounts, inForce: Set<StatutoryScheme>): SchemeStatuses {
	const out = {} as SchemeStatuses;
	for (const scheme of STATUTORY_SCHEMES) {
		out[scheme] = amounts[scheme] > 0 ? 'covered' : inForce.has(scheme) ? 'skipped' : 'not_tracked';
	}
	return out;
}

/** Latest row per staff member per month (a re-run updates in place, but legacy data can repeat). */
export function dedupeByStaffPeriod<T extends { staffRecordId: string; month: string; year: number; createdAt: Date }>(rows: T[]): T[] {
	const latest = new Map<string, T>();
	for (const row of rows) {
		const key = `${row.staffRecordId}:${monthIndexOf(row.month, row.year)}`;
		const existing = latest.get(key);
		if (!existing || row.createdAt > existing.createdAt) latest.set(key, row);
	}
	return Array.from(latest.values());
}

/**
 * Schemes in force for each row: the row's template carries the scheme, or
 * anyone in the same company and month has an amount for it.
 */
export function inForceByRow(rows: StatutoryPayrollRow[], templateSchemes: Map<string, Set<StatutoryScheme>>): Map<string, Set<StatutoryScheme>> {
	const periodSchemes = new Map<string, Set<StatutoryScheme>>();
	for (const row of rows) {
		const key = `${row.companyId}:${monthIndexOf(row.month, row.year)}`;
		const set = periodSchemes.get(key) || new Set<StatutoryScheme>();
		const amounts = amountsOf(row);
		for (const scheme of STATUTORY_SCHEMES) if (amounts[scheme] > 0) set.add(scheme);
		periodSchemes.set(key, set);
	}
	const out = new Map<string, Set<StatutoryScheme>>();
	for (const row of rows) {
		const set = new Set<StatutoryScheme>(periodSchemes.get(`${row.companyId}:${monthIndexOf(row.month, row.year)}`) || []);
		for (const scheme of (row.templateId && templateSchemes.get(row.templateId)) || []) set.add(scheme);
		out.set(row.id, set);
	}
	return out;
}

async function loadTemplateSchemes(templateIds: Array<string | null | undefined>): Promise<Map<string, Set<StatutoryScheme>>> {
	const ids = Array.from(new Set(templateIds.filter((id): id is string => !!id)));
	const map = new Map<string, Set<StatutoryScheme>>();
	if (ids.length === 0) return map;
	const fields = await prisma.payrollTemplateField.findMany({
		where: { templateId: { in: ids } },
		select: { templateId: true, systemField: true, displayName: true, valueSource: true, formulaConfig: true },
	});
	for (const id of ids) map.set(id, statutorySchemesOnTemplate(fields.filter((f) => f.templateId === id)));
	return map;
}

function grossOf(row: StatutoryPayrollRow): number {
	const direct = toNumber(row.finalGross) || toNumber(row.grossPay) || toNumber(row.proratedGrossPay);
	if (direct) return direct;
	const custom = (row.customFields || {}) as Record<string, { value?: unknown }>;
	return toNumber(custom.gross?.value);
}

// ---------------------------------------------------------------------------
// NSITF Employees' Schedule of Payments — the 12 identity fields the official
// template needs beyond what the generic statutory row already carries (see
// backend/src/app/lib/staff/nsitf-identity-fields.ts for where these are
// captured). All optional; a row is flagged "missing" when ANY of them is
// null — a dependant count of 0 is a real entered value, not "blank".
// ---------------------------------------------------------------------------

export type NsitfIdentity = {
	middleName: string | null;
	gender: string | null;
	dateOfBirth: string | null;
	maritalStatus: string | null;
	stateOfOrigin: string | null;
	lgaOfOrigin: string | null;
	townOfOrigin: string | null;
	alternatePhone: string | null;
	nin: string | null;
	stateOfIssuance: string | null;
	residentialAddress: string | null;
	numberOfPrimaryDependants: number | null;
	hireDate: string | null;
};

const NSITF_IDENTITY_KEYS: Array<keyof NsitfIdentity> = [
	'middleName', 'gender', 'dateOfBirth', 'maritalStatus', 'stateOfOrigin', 'lgaOfOrigin',
	'townOfOrigin', 'alternatePhone', 'nin', 'stateOfIssuance', 'residentialAddress', 'numberOfPrimaryDependants', 'hireDate',
];

function nsitfIdentityOf(staffRecord: {
	middleName?: string | null;
	gender?: string | null;
	dateOfBirth?: Date | null;
	maritalStatus?: string | null;
	stateOfOrigin?: string | null;
	lgaOfOrigin?: string | null;
	townOfOrigin?: string | null;
	alternatePhone?: string | null;
	nin?: string | null;
	stateOfIssuance?: string | null;
	residentialAddress?: string | null;
	numberOfPrimaryDependants?: number | null;
	hireDate?: Date | null;
} | null | undefined): NsitfIdentity {
	return {
		middleName: staffRecord?.middleName ?? null,
		gender: staffRecord?.gender ?? null,
		dateOfBirth: staffRecord?.dateOfBirth ? staffRecord.dateOfBirth.toISOString().slice(0, 10) : null,
		maritalStatus: staffRecord?.maritalStatus ?? null,
		stateOfOrigin: staffRecord?.stateOfOrigin ?? null,
		lgaOfOrigin: staffRecord?.lgaOfOrigin ?? null,
		townOfOrigin: staffRecord?.townOfOrigin ?? null,
		alternatePhone: staffRecord?.alternatePhone ?? null,
		nin: staffRecord?.nin ?? null,
		stateOfIssuance: staffRecord?.stateOfIssuance ?? null,
		residentialAddress: staffRecord?.residentialAddress ?? null,
		numberOfPrimaryDependants: staffRecord?.numberOfPrimaryDependants ?? null,
		hireDate: staffRecord?.hireDate ? staffRecord.hireDate.toISOString().slice(0, 10) : null,
	};
}

/** True when ANY of the 12 NSITF identity fields (+ hireDate) is missing. */
function isMissingNsitfDetails(identity: NsitfIdentity): boolean {
	return NSITF_IDENTITY_KEYS.some((key) => identity[key] === null);
}

/** The official NSITF sheet wants monthly gross earnings split into Naira + Kobo, not a computed contribution amount. */
export function nsitfEarningsSplit(gross: number): { naira: number; kobo: number } {
	const naira = Math.trunc(gross || 0);
	const kobo = Math.round(((gross || 0) - naira) * 100);
	return { naira, kobo };
}

// ---------------------------------------------------------------------------
// Per-run schedule
// ---------------------------------------------------------------------------

export type StatutoryScheduleRow = {
	payrollId: string;
	staffRecordId: string;
	staffId: string;
	name: string;
	firstName: string;
	lastName: string;
	department: string;
	position: string;
	phone: string;
	gross: number;
	basic: number;
	amounts: SchemeAmounts;
	status: SchemeStatuses;
	nsitfIdentity: NsitfIdentity;
	missingNsitfDetails: boolean;
};

// The official NSITF "Employees' Schedule of Payments" template's columns
// (see docs/NSITF_Employees_Payment_Schedule_Template.xlsx), shared by the
// combined statutory download (its NSITF sheet) and the single-scheme NSITF
// download so the two can never drift apart. ITF and NHF keep their generic
// 6-column shape — no official template was given for those.
export const NSITF_SCHEDULE_COLUMN_DEFS = [
	{ header: 'S/N', key: 'sn', width: 6, type: 'plainNumber' as const },
	{ header: 'SURNAME', key: 'surname', width: 18, type: 'text' as const },
	{ header: 'FIRSTNAME', key: 'firstname', width: 16, type: 'text' as const },
	{ header: 'MIDDLENAME', key: 'middlename', width: 16, type: 'text' as const },
	{ header: 'GENDER', key: 'gender', width: 10, type: 'text' as const },
	{ header: 'EMPLOYEE_ID', key: 'employeeId', width: 16, type: 'text' as const },
	{ header: 'DATE_OF_EMPLOYMENT', key: 'dateOfEmployment', width: 16, type: 'text' as const },
	{ header: 'DATE_OF_BIRTH', key: 'dateOfBirth', width: 16, type: 'text' as const },
	{ header: 'STATE_OF_ORIGIN', key: 'stateOfOrigin', width: 16, type: 'text' as const },
	{ header: 'LGA', key: 'lga', width: 16, type: 'text' as const },
	{ header: 'TOWN', key: 'town', width: 16, type: 'text' as const },
	{ header: 'CONTACT_PHONE_NUMBER', key: 'contactPhone', width: 16, type: 'text' as const },
	{ header: 'ALTERNATE_PHONE_NUMBER', key: 'alternatePhone', width: 18, type: 'text' as const },
	{ header: 'MEANS_OF_IDENTIFICATION', key: 'meansOfIdentification', width: 14, type: 'text' as const },
	{ header: 'MEANS_OF_IDENTIFICATION_NUMBER', key: 'meansOfIdentificationNumber', width: 20, type: 'text' as const },
	{ header: 'STATE_OF_ISSUANCE', key: 'stateOfIssuance', width: 16, type: 'text' as const },
	{ header: 'ADDRESS_OF_EMPLOYEE', key: 'addressOfEmployee', width: 32, type: 'text' as const },
	{ header: 'JOB_TITLE', key: 'jobTitle', width: 18, type: 'text' as const },
	{ header: 'MARITAL_STATUS', key: 'maritalStatus', width: 14, type: 'text' as const },
	{ header: 'NUMBER_OF_PRIMARY_DEPENDANTS', key: 'numberOfPrimaryDependants', width: 14, type: 'plainNumber' as const },
	{ header: 'TOTAL_MONTHLY_EARNINGS', key: 'totalMonthlyEarnings', width: 18, type: 'plainNumber' as const },
	{ header: 'KOBO', key: 'kobo', width: 10, type: 'plainNumber' as const },
];

/** One NSITF schedule row → the official template's flat record shape. `index` drives S/N. */
export function toNsitfScheduleRecord(row: StatutoryScheduleRow, index: number): Record<string, unknown> {
	const { naira, kobo } = nsitfEarningsSplit(row.gross);
	return {
		sn: index + 1,
		surname: row.lastName,
		firstname: row.firstName,
		middlename: row.nsitfIdentity.middleName || '',
		gender: row.nsitfIdentity.gender || '',
		employeeId: row.staffId,
		dateOfEmployment: row.nsitfIdentity.hireDate || '',
		dateOfBirth: row.nsitfIdentity.dateOfBirth || '',
		stateOfOrigin: row.nsitfIdentity.stateOfOrigin || '',
		lga: row.nsitfIdentity.lgaOfOrigin || '',
		town: row.nsitfIdentity.townOfOrigin || '',
		contactPhone: row.phone || '',
		alternatePhone: row.nsitfIdentity.alternatePhone || '',
		meansOfIdentification: 'NIN',
		meansOfIdentificationNumber: row.nsitfIdentity.nin || '',
		stateOfIssuance: row.nsitfIdentity.stateOfIssuance || '',
		addressOfEmployee: row.nsitfIdentity.residentialAddress || '',
		jobTitle: row.position || '',
		maritalStatus: row.nsitfIdentity.maritalStatus || '',
		numberOfPrimaryDependants: row.nsitfIdentity.numberOfPrimaryDependants ?? '',
		totalMonthlyEarnings: naira,
		kobo,
	};
}

/** Why a row belongs on the Missing Details sheet — mirrors the Pension Schedule's split. */
export function nsitfMissingFlags(row: StatutoryScheduleRow): string[] {
	const flags: string[] = [];
	if (row.missingNsitfDetails) flags.push('Missing identity details');
	if (row.status.nsitf === 'skipped') flags.push('Skipped NSITF contribution');
	return flags;
}

export type SchemeSummary = { inForce: boolean; total: number; coveredCount: number; skippedCount: number };

export type StatutorySchedule = {
	sourceType: BankScheduleSourceType;
	sourceId: string;
	label: string;
	companyId: string;
	companyName: string;
	payPeriod: string;
	month: number;
	year: number;
	status: string;
	createdAt: Date;
	staffCount: number;
	schemes: Record<StatutoryScheme, SchemeSummary>;
	rows: StatutoryScheduleRow[];
	departments: Array<{ department: string; staffCount: number } & SchemeAmounts>;
};

const SCHEDULE_SELECT = {
	id: true,
	companyId: true,
	staffRecordId: true,
	month: true,
	year: true,
	templateId: true,
	createdAt: true,
	nsitf: true,
	itf: true,
	nhf: true,
	grossPay: true,
	finalGross: true,
	proratedGrossPay: true,
	basicSalary: true,
	customFields: true,
	staffRecord: {
		select: {
			staffId: true,
			firstName: true,
			lastName: true,
			department: true,
			position: true,
			phone: true,
			hireDate: true,
			middleName: true,
			gender: true,
			dateOfBirth: true,
			maritalStatus: true,
			stateOfOrigin: true,
			lgaOfOrigin: true,
			townOfOrigin: true,
			alternatePhone: true,
			nin: true,
			stateOfIssuance: true,
			residentialAddress: true,
			numberOfPrimaryDependants: true,
		},
	},
} as const;

type StatutoryStaffRecord = {
	staffId?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	department?: string | null;
	position?: string | null;
	phone?: string | null;
	hireDate?: Date | null;
	middleName?: string | null;
	gender?: string | null;
	dateOfBirth?: Date | null;
	maritalStatus?: string | null;
	stateOfOrigin?: string | null;
	lgaOfOrigin?: string | null;
	townOfOrigin?: string | null;
	alternatePhone?: string | null;
	nin?: string | null;
	stateOfIssuance?: string | null;
	residentialAddress?: string | null;
	numberOfPrimaryDependants?: number | null;
} | null;

/** Pure: assemble the schedule body from rows (exported for tests). */
export function summariseSchedule(
	rows: Array<StatutoryPayrollRow & { staffRecord?: StatutoryStaffRecord }>,
	runSchemes: Set<StatutoryScheme>
) {
	const deduped = dedupeByStaffPeriod(rows);
	const inForce = new Set<StatutoryScheme>(runSchemes);
	for (const row of deduped) {
		const a = amountsOf(row);
		for (const scheme of STATUTORY_SCHEMES) if (a[scheme] > 0) inForce.add(scheme);
	}

	const scheduleRows: StatutoryScheduleRow[] = deduped
		.map((row) => {
			const amounts = amountsOf(row);
			const nsitfIdentity = nsitfIdentityOf(row.staffRecord);
			return {
				payrollId: row.id,
				staffRecordId: row.staffRecordId,
				staffId: row.staffRecord?.staffId || '',
				name: `${row.staffRecord?.firstName || ''} ${row.staffRecord?.lastName || ''}`.trim(),
				firstName: row.staffRecord?.firstName || '',
				lastName: row.staffRecord?.lastName || '',
				department: row.staffRecord?.department || 'Unassigned',
				position: row.staffRecord?.position || '',
				phone: row.staffRecord?.phone || '',
				gross: round2(grossOf(row)),
				basic: round2(toNumber(row.basicSalary) || toNumber(((row.customFields || {}) as Record<string, { value?: unknown }>).basic?.value)),
				amounts,
				status: coverageFor(amounts, inForce),
				nsitfIdentity,
				missingNsitfDetails: isMissingNsitfDetails(nsitfIdentity),
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	const schemes = {} as Record<StatutoryScheme, SchemeSummary>;
	for (const scheme of STATUTORY_SCHEMES) {
		schemes[scheme] = {
			inForce: inForce.has(scheme),
			total: round2(scheduleRows.reduce((sum, r) => sum + r.amounts[scheme], 0)),
			coveredCount: scheduleRows.filter((r) => r.status[scheme] === 'covered').length,
			skippedCount: scheduleRows.filter((r) => r.status[scheme] === 'skipped').length,
		};
	}

	const byDept = new Map<string, { department: string; staffCount: number } & SchemeAmounts>();
	for (const r of scheduleRows) {
		const d = byDept.get(r.department) || { department: r.department, staffCount: 0, nsitf: 0, itf: 0, nhf: 0 };
		d.staffCount += 1;
		for (const scheme of STATUTORY_SCHEMES) d[scheme] = round2(d[scheme] + r.amounts[scheme]);
		byDept.set(r.department, d);
	}

	return { rows: scheduleRows, schemes, departments: Array.from(byDept.values()).sort((a, b) => a.department.localeCompare(b.department)) };
}

export async function buildStatutorySchedule(sourceType: BankScheduleSourceType, sourceId: string, companyIds: string[]): Promise<StatutorySchedule | null> {
	const scope = await resolvePayrollSource(sourceType, sourceId, companyIds);
	if (!scope) return null;

	const payrolls = (await prisma.payroll.findMany({ where: scope.payrollWhere, select: SCHEDULE_SELECT })) as any[];
	const templateSchemes = await loadTemplateSchemes([scope.templateId, ...payrolls.map((p) => p.templateId)]);
	const runSchemes = new Set<StatutoryScheme>();
	for (const id of [scope.templateId, ...payrolls.map((p) => p.templateId)]) for (const s of (id && templateSchemes.get(id)) || []) runSchemes.add(s);

	const body = summariseSchedule(payrolls, runSchemes);
	const first = payrolls[0];
	const monthNumber = first ? monthNameToNumber(first.month) || 1 : 1;
	const year = first ? first.year : new Date().getFullYear();
	const payPeriod = scope.payPeriod || (first ? `${MONTH_LONG[monthNumber - 1]} ${year}` : 'Unknown period');

	return {
		sourceType,
		sourceId,
		label: scope.fileName ? `${scope.fileName}, ${payPeriod}` : `${payPeriod}, generation run`,
		companyId: scope.companyId,
		companyName: scope.companyName,
		payPeriod,
		month: monthNumber,
		year,
		status: scope.status,
		createdAt: scope.createdAt,
		staffCount: body.rows.length,
		...body,
	};
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export type StatutoryTrendPoint = {
	month: number;
	year: number;
	label: string;
	staffCount: number;
	skipped: SchemeAmounts;
} & SchemeAmounts;

const TREND_SELECT = { id: true, companyId: true, staffRecordId: true, month: true, year: true, templateId: true, createdAt: true, nsitf: true, itf: true, nhf: true } as const;

/** Pure: bucket rows into `months` consecutive months ending at endIndex. */
export function bucketTrend(rows: StatutoryPayrollRow[], inForce: Map<string, Set<StatutoryScheme>>, endIndex: number, months: number): StatutoryTrendPoint[] {
	const startIndex = endIndex - months + 1;
	const points = new Map<number, StatutoryTrendPoint>();
	for (let i = startIndex; i <= endIndex; i++) {
		const { year, monthNumber } = fromMonthIndex(i);
		points.set(i, { month: monthNumber, year, label: `${MONTH_SHORT[monthNumber - 1]} ${year}`, staffCount: 0, nsitf: 0, itf: 0, nhf: 0, skipped: { nsitf: 0, itf: 0, nhf: 0 } });
	}
	for (const row of dedupeByStaffPeriod(rows)) {
		const point = points.get(monthIndexOf(row.month, row.year));
		if (!point) continue;
		const amounts = amountsOf(row);
		const status = coverageFor(amounts, inForce.get(row.id) || new Set());
		point.staffCount += 1;
		for (const scheme of STATUTORY_SCHEMES) {
			point[scheme] = round2(point[scheme] + amounts[scheme]);
			if (status[scheme] === 'skipped') point.skipped[scheme] += 1;
		}
	}
	return Array.from(points.values());
}

async function latestPeriodIndex(companyIds: string[]): Promise<number | null> {
	const latest = await prisma.payroll.findMany({ where: { companyId: { in: companyIds } }, select: { month: true, year: true }, distinct: ['year', 'month'], orderBy: { year: 'desc' }, take: 24 });
	if (latest.length === 0) return null;
	return Math.max(...latest.map((r) => monthIndexOf(r.month, r.year)));
}

export async function buildStatutoryTrend({ companyIds, endYear, endMonth, months = 12 }: { companyIds: string[]; endYear?: number; endMonth?: number; months?: number }) {
	if (companyIds.length === 0) return { points: [] as StatutoryTrendPoint[], endYear: null, endMonth: null };
	const endIndex = endYear && endMonth ? endYear * 12 + endMonth : await latestPeriodIndex(companyIds);
	if (!endIndex) return { points: [] as StatutoryTrendPoint[], endYear: null, endMonth: null };
	const startYear = fromMonthIndex(endIndex - months + 1).year;
	const { year: lastYear, monthNumber } = fromMonthIndex(endIndex);

	const rows = (await prisma.payroll.findMany({ where: { companyId: { in: companyIds }, year: { gte: startYear, lte: lastYear } }, select: TREND_SELECT })) as StatutoryPayrollRow[];
	const templateSchemes = await loadTemplateSchemes(rows.map((r) => r.templateId));
	return { points: bucketTrend(rows, inForceByRow(rows, templateSchemes), endIndex, months), endYear: lastYear, endMonth: monthNumber };
}

// ---------------------------------------------------------------------------
// Coverage tracking
// ---------------------------------------------------------------------------

export type CoverageEntry = { payrollId: string; month: number; year: number; label: string; amounts: SchemeAmounts; status: SchemeStatuses };
export type CoverageGap = { scheme: StatutoryScheme; from: string; to: string; months: number; resolvedIn: string | null; ongoing: boolean };

/** Pure: consecutive skipped runs per scheme. Not-tracked months neither start nor break a run. */
export function detectCoverageGaps(entries: CoverageEntry[]): CoverageGap[] {
	const gaps: CoverageGap[] = [];
	for (const scheme of STATUTORY_SCHEMES) {
		let start: CoverageEntry | null = null;
		let end: CoverageEntry | null = null;
		let count = 0;
		for (const entry of entries) {
			const s = entry.status[scheme];
			if (s === 'not_tracked') continue;
			if (s === 'skipped') {
				if (!start) start = entry;
				end = entry;
				count += 1;
			} else if (start && end) {
				gaps.push({ scheme, from: start.label, to: end.label, months: count, resolvedIn: entry.label, ongoing: false });
				start = null;
				end = null;
				count = 0;
			}
		}
		if (start && end) gaps.push({ scheme, from: start.label, to: end.label, months: count, resolvedIn: null, ongoing: true });
	}
	return gaps;
}

function toCoverageEntries(rows: StatutoryPayrollRow[], inForce: Map<string, Set<StatutoryScheme>>): CoverageEntry[] {
	return dedupeByStaffPeriod(rows)
		.sort((a, b) => monthIndexOf(a.month, a.year) - monthIndexOf(b.month, b.year))
		.map((row) => {
			const monthNumber = monthNameToNumber(row.month) || 1;
			const amounts = amountsOf(row);
			return { payrollId: row.id, month: monthNumber, year: row.year, label: `${MONTH_SHORT[monthNumber - 1]} ${row.year}`, amounts, status: coverageFor(amounts, inForce.get(row.id) || new Set()) };
		});
}

// In-force is decided per company and month, so load every staff member's
// rows for the months involved, not just the one staff member's rows.
async function loadCompanyRows(companyId: string, fromIndex: number | null) {
	const where: Record<string, unknown> = { companyId };
	if (fromIndex) where.year = { gte: fromMonthIndex(fromIndex).year };
	const rows = (await prisma.payroll.findMany({ where, select: TREND_SELECT })) as StatutoryPayrollRow[];
	const filtered = fromIndex ? rows.filter((r) => monthIndexOf(r.month, r.year) >= fromIndex) : rows;
	const templateSchemes = await loadTemplateSchemes(filtered.map((r) => r.templateId));
	return { rows: filtered, inForce: inForceByRow(filtered, templateSchemes) };
}

export async function getStaffStatutoryHistory(staffRecordId: string, companyId: string) {
	const staff = await prisma.staffRecord.findFirst({ where: { id: staffRecordId, companyId }, select: { id: true, staffId: true, firstName: true, lastName: true, department: true } });
	if (!staff) return null;
	const { rows, inForce } = await loadCompanyRows(companyId, null);
	const entries = toCoverageEntries(
		rows.filter((r) => r.staffRecordId === staffRecordId),
		inForce
	);
	return {
		staffRecordId: staff.id,
		staffId: staff.staffId || '',
		name: `${staff.firstName} ${staff.lastName}`.trim(),
		department: staff.department || '',
		entries,
		gaps: detectCoverageGaps(entries),
	};
}

export async function getCompanyStatutoryGaps(companyId: string, { months = 12 }: { months?: number } = {}) {
	const endIndex = await latestPeriodIndex([companyId]);
	if (!endIndex) return [];
	const { rows, inForce } = await loadCompanyRows(companyId, endIndex - months + 1);

	const byStaff = new Map<string, StatutoryPayrollRow[]>();
	for (const row of rows) byStaff.set(row.staffRecordId, [...(byStaff.get(row.staffRecordId) || []), row]);

	const staff = await prisma.staffRecord.findMany({ where: { id: { in: Array.from(byStaff.keys()) } }, select: { id: true, staffId: true, firstName: true, lastName: true, department: true } });
	const staffById = new Map(staff.map((s) => [s.id, s]));

	const out = [];
	for (const [staffRecordId, staffRows] of byStaff) {
		const entries = toCoverageEntries(staffRows, inForce);
		const gaps = detectCoverageGaps(entries);
		if (gaps.length === 0) continue;
		const s = staffById.get(staffRecordId);
		out.push({
			staffRecordId,
			staffId: s?.staffId || '',
			name: s ? `${s.firstName} ${s.lastName}`.trim() : '',
			department: s?.department || '',
			skippedMonths: entries.filter((e) => STATUTORY_SCHEMES.some((k) => e.status[k] === 'skipped')).map((e) => ({ label: e.label, schemes: STATUTORY_SCHEMES.filter((k) => e.status[k] === 'skipped') })),
			gaps,
		});
	}
	return out.sort((a, b) => Number(b.gaps.some((g) => g.ongoing)) - Number(a.gaps.some((g) => g.ongoing)) || a.name.localeCompare(b.name));
}
