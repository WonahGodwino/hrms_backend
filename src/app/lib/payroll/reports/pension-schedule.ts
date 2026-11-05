// src/app/lib/payroll/reports/pension-schedule.ts
//
// Shared core for the per-payroll Pension Schedule report, shaped like
// docs/Pension Schedule template.xlsx: Employer Code | For The Month Of |
// Year Of Contribution | Staff ID | RSA PIN | Name of Employee | Normal
// contribution for employee | Normal contribution for employer | Voluntary
// contribution by employee | Voluntary contribution by employer | Other
// Contribution | TOTAL AMT.(Naira) | Contribution Type/Code | PFA Code.
//
// Sources are identical to the Bank Schedule report (an upload or a
// generation run) - listBankScheduleSources is reused as-is since it's
// already generic to payroll runs, not bank-specific.
//
// Field resolution:
//  - Normal EE  = Payroll.pensionDeduction (fixed templates) or the
//    'pension' customField (DYNAMIC templates).
//  - Normal ER  = Payroll.employerPension (fixed templates, e.g. the
//    ISURF_STANDARD "Employer Pension" upload column) or the
//    'employer_pension' customField (DYNAMIC templates). If the source's
//    template has no employer pension column/field at all, every row's
//    Normal ER is 0 and `missingEmployerPension` is set on the schedule.
//  - RSA PIN / PFA Code / Employer Code come from StaffRecord (or the
//    payroll's own point-in-time snapshot, see below) - this report is
//    read-only.
//  - Contribution Type / Voluntary EE+ER / Other Contribution are captured
//    per payroll run at generation/upload time (an opt-in MANUAL field on
//    the company's payroll template, see
//    backend/src/app/lib/staff/pension-fields.ts's MANUAL_PENSION_CAPTURE_FIELDS),
//    read straight off that Payroll row's customFields — never from
//    StaffRecord, which no longer carries a live value for these once a
//    company has moved off the old Staff Management fields.
//  - Employer Code = staff override ?? company default ?? ''.
//  - TOTAL AMT = Normal EE + Normal ER only.
import { prisma } from '@/app/lib/db';
import { getCustomFieldValue } from '@/app/lib/payroll/utils';
import { monthNameToNumber } from '@/app/lib/payroll/utils/valueParsing';
import { listBankScheduleSources, toNumber } from '@/app/lib/payroll/reports/bank-schedule';
import type { BankScheduleSource, BankScheduleSourceType } from '@/app/lib/payroll/reports/bank-schedule';
import { resolvePayrollSource } from '@/app/lib/payroll/reports/source-scope';

import type { CustomFieldValue } from '@/app/lib/payroll/templates/types';

export type { BankScheduleSourceType as PensionScheduleSourceType };
export const listPensionScheduleSources = listBankScheduleSources;
export type PensionScheduleSource = BankScheduleSource;

export const CONTRIBUTION_TYPES: Array<{ code: string; description: string }> = [
	{ code: 'MAN', description: 'Mandatory' },
	{ code: 'ADD', description: 'Additional Contribution' },
	{ code: 'PEN', description: 'Penalty' },
	{ code: 'ARR', description: 'Arrears' },
	{ code: 'ACR', description: 'Accrued Rights' },
	{ code: 'BON', description: 'State Bonds (Accrued Rights)' },
	{ code: 'UPF', description: 'Pension from Upfront (Housing etc)' },
	{ code: 'OFF', description: 'Off-Cycle' },
	{ code: '13T', description: 'Pension from 13th Month' },
	{ code: '14T', description: 'Pensions from 14th Month' },
	{ code: 'OTH', description: 'Others' },
	{ code: 'INC', description: 'Pension Increases' },
	{ code: 'HOU', description: 'Housing Allowance or Rent' },
	{ code: 'PRE', description: 'Pre-CPS Contributions such as NSITF' },
	{ code: 'SHO', description: 'Shortfalls' },
];

const DEFAULT_CONTRIBUTION_TYPE = 'MAN';

export type PensionScheduleRow = {
	staffRecordId: string;
	employerCode: string;
	month: string;
	year: number;
	staffId: string;
	rsaPin: string;
	name: string;
	normalEmployee: number;
	normalEmployer: number;
	voluntaryEmployee: number;
	voluntaryEmployer: number;
	otherContribution: number;
	totalAmount: number;
	contributionType: string;
	pfaCode: string;
	missingPensionDetails: boolean;
};

export type PensionGroup = {
	pfaCode: string;
	staffCount: number;
	subtotal: number;
	rows: PensionScheduleRow[];
	disabledForCompany: boolean;
};

export type PensionSchedule = {
	sourceType: BankScheduleSourceType;
	sourceId: string;
	label: string;
	companyId: string;
	companyName: string;
	payPeriod: string;
	status: string;
	createdAt: Date;
	staffCount: number;
	totalNormalEmployee: number;
	totalNormalEmployer: number;
	missingPensionDetailsCount: number;
	missingEmployerPension: boolean;
	groups: PensionGroup[];
};

type CustomFieldsLike = Record<string, CustomFieldValue>;

function toCustomFieldsMap(value: unknown): CustomFieldsLike | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as CustomFieldsLike;
}

type PayrollForPension = {
	id: string;
	companyId: string;
	staffRecordId: string;
	month: string;
	year: number;
	templateType: string | null;
	customFields: unknown;
	pensionDeduction: unknown;
	employerPension: unknown;
	pensionSnapshotAt: Date | null;
	pensionRsaPinSnapshot: string | null;
	pensionPfaCodeSnapshot: string | null;
	pensionEmployerCodeSnapshot: string | null;
	staffRecord: {
		staffId: string | null;
		firstName: string;
		lastName: string;
		rsaPin: string | null;
		pfaCode: string | null;
		pensionEmployerCode: string | null;
	} | null;
};

function buildRowsFromPayroll(payrolls: PayrollForPension[], companyPensionEmployerCode: string): PensionScheduleRow[] {
	const deduped = new Map<string, PayrollForPension>();
	for (const p of payrolls) {
		deduped.set(`${p.staffRecordId}-${p.month}-${p.year}`, p);
	}
	const uniquePayrolls = Array.from(deduped.values());

	return uniquePayrolls.map((payroll) => {
		const staffRecord = payroll.staffRecord;
		const customFields = toCustomFieldsMap(payroll.customFields);

		let normalEmployee = toNumber(payroll.pensionDeduction);
		if (!normalEmployee && payroll.templateType === 'DYNAMIC') {
			normalEmployee = getCustomFieldValue(customFields, 'pension') ?? 0;
		}

		let normalEmployer = toNumber(payroll.employerPension);
		if (!normalEmployer && payroll.templateType === 'DYNAMIC') {
			normalEmployer = getCustomFieldValue(customFields, 'employer_pension') ?? 0;
		}

		const voluntaryEmployee = getCustomFieldValue(customFields, 'voluntaryPensionEmployee') ?? 0;
		const voluntaryEmployer = getCustomFieldValue(customFields, 'voluntaryPensionEmployer') ?? 0;
		const otherContribution = getCustomFieldValue(customFields, 'otherPensionContribution') ?? 0;
		const contributionType = (customFields?.pensionContributionType?.value as string) || DEFAULT_CONTRIBUTION_TYPE;

		// A payroll with pensionSnapshotAt set carries its own point-in-time
		// RSA PIN/PFA Code/Employer Code, captured when that month's payroll
		// was created. Prefer it over the (possibly since-edited) live
		// StaffRecord so a historical schedule reflects what was actually true
		// at the time, not what's true today. Payrolls created before the
		// snapshot feature shipped have no snapshot and fall back to live data,
		// same as before.
		const hasSnapshot = payroll.pensionSnapshotAt !== null;
		const rsaPin = (hasSnapshot ? payroll.pensionRsaPinSnapshot : staffRecord?.rsaPin)?.trim() || '';
		const pfaCode = (hasSnapshot ? payroll.pensionPfaCodeSnapshot : staffRecord?.pfaCode)?.trim() || '';
		const employerCode = (hasSnapshot ? payroll.pensionEmployerCodeSnapshot : staffRecord?.pensionEmployerCode)?.trim() || companyPensionEmployerCode || '';
		const name = `${staffRecord?.firstName || ''} ${staffRecord?.lastName || ''}`.trim();

		return {
			staffRecordId: payroll.staffRecordId,
			employerCode,
			month: payroll.month,
			year: payroll.year,
			staffId: staffRecord?.staffId || '',
			rsaPin,
			name,
			normalEmployee,
			normalEmployer,
			voluntaryEmployee,
			voluntaryEmployer,
			otherContribution,
			totalAmount: normalEmployee + normalEmployer,
			contributionType,
			pfaCode,
			missingPensionDetails: !rsaPin || !pfaCode || !employerCode,
		};
	});
}

// disabledPfaCodes is checked against LIVE CompanyDisabledPfa state, never
// the pensionRsaPinSnapshot/pensionPfaCodeSnapshot used for
// missingPensionDetails above — "this PFA is disabled for your company
// today" is a current-policy question, not a historical one.
function groupByPfaCode(rows: PensionScheduleRow[], disabledPfaCodes: Set<string> = new Set()): PensionGroup[] {
	const groups = new Map<string, PensionGroup>();
	for (const row of rows) {
		const key = row.pfaCode ? row.pfaCode.toUpperCase() : 'UNASSIGNED';
		const group = groups.get(key) || {
			pfaCode: row.pfaCode || 'Unassigned',
			staffCount: 0,
			subtotal: 0,
			rows: [],
			disabledForCompany: disabledPfaCodes.has(key),
		};
		group.staffCount += 1;
		group.subtotal += row.totalAmount;
		group.rows.push(row);
		groups.set(key, group);
	}
	return Array.from(groups.values()).sort((a, b) => a.pfaCode.localeCompare(b.pfaCode));
}

const PAYROLL_SELECT = {
	id: true,
	companyId: true,
	staffRecordId: true,
	month: true,
	year: true,
	templateType: true,
	customFields: true,
	pensionDeduction: true,
	employerPension: true,
	pensionSnapshotAt: true,
	pensionRsaPinSnapshot: true,
	pensionPfaCodeSnapshot: true,
	pensionEmployerCodeSnapshot: true,
	staffRecord: {
		select: {
			staffId: true,
			firstName: true,
			lastName: true,
			rsaPin: true,
			pfaCode: true,
			pensionEmployerCode: true,
		},
	},
} as const;

async function hasEmployerPensionData(
	sourceType: BankScheduleSourceType,
	templateId: string | null,
	payrolls: PayrollForPension[]
): Promise<boolean> {
	if (sourceType === 'generated' && templateId) {
		const field = await prisma.payrollTemplateField.findFirst({
			where: { templateId, systemField: 'employer_pension' },
			select: { id: true },
		});
		if (field) return true;
	}
	return payrolls.some((p) => p.employerPension != null && toNumber(p.employerPension) !== 0);
}

export async function buildPensionSchedule(sourceType: BankScheduleSourceType, sourceId: string, companyIds: string[]): Promise<PensionSchedule | null> {
	const scope = await resolvePayrollSource(sourceType, sourceId, companyIds);
	if (!scope) return null;

	const payrolls = (await prisma.payroll.findMany({ where: scope.payrollWhere, select: PAYROLL_SELECT })) as any as PayrollForPension[];
	const rows = buildRowsFromPayroll(payrolls, scope.companyPensionEmployerCode);
	const missingEmployerPension = !(await hasEmployerPensionData(sourceType, sourceType === 'generated' ? scope.templateId : null, payrolls));
	const payPeriod = scope.payPeriod || (rows[0] ? `${rows[0].month} ${rows[0].year}` : 'Unknown period');
	const disabledPfaRows = await prisma.companyDisabledPfa.findMany({ where: { companyId: scope.companyId }, select: { pfaCode: true } });
	const disabledPfaCodes = new Set(disabledPfaRows.map((d) => d.pfaCode.toUpperCase()));

	return {
		sourceType,
		sourceId,
		label: scope.fileName ? `${scope.fileName} — ${payPeriod}` : `${payPeriod} — generation run`,
		companyId: scope.companyId,
		companyName: scope.companyName,
		payPeriod,
		status: scope.status,
		createdAt: scope.createdAt,
		staffCount: rows.length,
		totalNormalEmployee: rows.reduce((sum, row) => sum + row.normalEmployee, 0),
		totalNormalEmployer: rows.reduce((sum, row) => sum + row.normalEmployer, 0),
		missingPensionDetailsCount: rows.filter((row) => row.missingPensionDetails).length,
		missingEmployerPension,
		groups: groupByPfaCode(rows, disabledPfaCodes),
	};
}

// ---------------------------------------------------------------------------
// Multi-period / multi-staff generation ("by staff" mode) — same 14-column
// shape as buildPensionSchedule, but driven directly off a chosen set of
// staff and a month/year range instead of a single upload/generation run.
// Reuses buildRowsFromPayroll/groupByPfaCode unchanged, since those were
// already written source-agnostically over a Payroll[] array.
// ---------------------------------------------------------------------------

export type PensionScheduleStaffParams = {
	staffRecordIds: string[];
	companyId: string;
	fromMonth: number; // 1-12
	fromYear: number;
	toMonth: number; // 1-12
	toYear: number;
};

export type PensionScheduleMulti = {
	companyId: string;
	companyName: string;
	periodLabel: string;
	staffCount: number;
	totalNormalEmployee: number;
	totalNormalEmployer: number;
	missingPensionDetailsCount: number;
	missingEmployerPension: boolean;
	groups: PensionGroup[];
};

export async function buildPensionScheduleForStaff(params: PensionScheduleStaffParams, accessibleCompanyIds: string[]): Promise<PensionScheduleMulti | null> {
	const { staffRecordIds, companyId, fromMonth, fromYear, toMonth, toYear } = params;
	if (staffRecordIds.length === 0 || !accessibleCompanyIds.includes(companyId)) return null;

	const fromIndex = fromYear * 12 + fromMonth;
	const toIndex = toYear * 12 + toMonth;
	if (toIndex < fromIndex) return null;

	const company = await prisma.company.findUnique({ where: { id: companyId }, select: { companyName: true, pensionEmployerCode: true } });
	if (!company) return null;

	const payrolls = (await prisma.payroll.findMany({
		where: { staffRecordId: { in: staffRecordIds }, companyId },
		select: PAYROLL_SELECT,
	})) as any as PayrollForPension[];

	const inRange = payrolls.filter((p) => {
		const idx = p.year * 12 + (monthNameToNumber(p.month) || 0);
		return idx >= fromIndex && idx <= toIndex;
	});

	const companyCode = company.pensionEmployerCode || '';
	const rows = buildRowsFromPayroll(inRange, companyCode);
	const disabledPfaRows = await prisma.companyDisabledPfa.findMany({ where: { companyId }, select: { pfaCode: true } });
	const disabledPfaCodes = new Set(disabledPfaRows.map((d) => d.pfaCode.toUpperCase()));

	// Simpler than the single-source check (no generation-run template lookup
	// across a range of possibly-different runs/templates) — a reasonable
	// approximation: any non-zero employer pension anywhere in range means the
	// data exists, consistent with the upload-path fallback used elsewhere.
	const missingEmployerPension = !inRange.some((p) => p.employerPension != null && toNumber(p.employerPension) !== 0);

	const fromLabel = `${fromYear}-${String(fromMonth).padStart(2, '0')}`;
	const toLabel = `${toYear}-${String(toMonth).padStart(2, '0')}`;
	const periodLabel = fromLabel === toLabel ? fromLabel : `${fromLabel} to ${toLabel}`;

	return {
		companyId,
		companyName: company.companyName,
		periodLabel,
		staffCount: rows.length,
		totalNormalEmployee: rows.reduce((sum, row) => sum + row.normalEmployee, 0),
		totalNormalEmployer: rows.reduce((sum, row) => sum + row.normalEmployer, 0),
		missingPensionDetailsCount: rows.filter((row) => row.missingPensionDetails).length,
		missingEmployerPension,
		groups: groupByPfaCode(rows, disabledPfaCodes),
	};
}
