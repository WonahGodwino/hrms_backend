// src/app/lib/payroll/reports/bank-schedule.ts
//
// Shared core for the per-payroll Bank Schedule report (the "hand this to
// the bank" sheet, shaped like docs/bank-schedule.xlsx: NAME | BANK NAME |
// ACCOUNT NUMBER | NET SALARY | CODE, grouped by bank).
//
// Two source types are supported:
//  - 'upload'    → a completed PayrollUpload; rows resolved via
//                  Payroll.payrollUploadId (new uploads) with a time-window
//                  fallback for uploads that predate the link column.
//  - 'generated' → an approved PayrollGenerationRun; rows resolved via
//                  PayrollData.payrollId (finalized rows reference the
//                  generated Payroll records' company/template/period).
//
// Net salary is the value the payroll actually paid (Payroll.netSalary), with
// the dynamic-template customFields totals derivation (same math as
// aggregatePayrollPeriod.ts) as fallback for DYNAMIC rows that store figures
// only inside customFields. Bank name/account come from the current
// StaffRecord, mirroring how the existing period-based bank-schedule export
// reads them.
import { prisma } from '@/app/lib/db';
import { resolveBankCode } from '@/app/lib/payroll-verifier/banks';
import { calculateTotals, getPayslipDisplayFields } from '@/app/lib/payroll/utils';

import type { CustomFieldValue } from '@/app/lib/payroll/templates/types';
// ---------------------------------------------------------------------------
// Static CBN bank-code fallback
// ---------------------------------------------------------------------------

// Major Nigerian banks and their CBN codes — used when the Flutterwave-backed
// resolver (payroll-verifier/banks.ts) has no live list (FLW_SECRET_KEY unset,
// Flutterwave down, bank not on the live list). Keys are normalized
// (uppercase, collapsed spaces) and matched with an exact-hit-first, then
// "contains" strategy.
const CBN_BANK_CODES: Array<{ pattern: RegExp; code: string; name: string }> = [
	{ pattern: /ACCESS\s*(BANK|DIAMOND)?|DIAMOND/, code: '044', name: 'Access Bank' },
	{ pattern: /CITIBANK|CITI\s*BANK/, code: '023', name: 'Citibank' },
	{ pattern: /ECOBANK/, code: '050', name: 'Ecobank' },
	{ pattern: /FIDELITY/, code: '070', name: 'Fidelity Bank' },
	{ pattern: /FIRST\s*CITY|FCMB/, code: '214', name: 'FCMB' },
	{ pattern: /FIRST\s*BANK|FBN|FIRST\s*BANK\s*OF\s*NIGERIA/, code: '011', name: 'First Bank of Nigeria' },
	{ pattern: /GUARANTY|GTB|GT\s*BANK/, code: '058', name: 'Guaranty Trust Bank' },
	{ pattern: /HERITAGE/, code: '030', name: 'Heritage Bank' },
	{ pattern: /JAIZ/, code: '301', name: 'Jaiz Bank' },
	{ pattern: /KEYSTONE/, code: '082', name: 'Keystone Bank' },
	{ pattern: /POLARIS|SKY\s*BANK/, code: '076', name: 'Polaris Bank' },
	{ pattern: /PROVIDUS/, code: '101', name: 'Providus Bank' },
	{ pattern: /STANBIC/, code: '221', name: 'Stanbic IBTC' },
	{ pattern: /STANDARD\s*CHARTERED/, code: '068', name: 'Standard Chartered' },
	{ pattern: /STERLING/, code: '232', name: 'Sterling Bank' },
	{ pattern: /SUNTRUST/, code: '100', name: 'SunTrust Bank' },
	{ pattern: /TAJ\s*BANK/, code: '302', name: 'Taj Bank' },
	{ pattern: /TITAN/, code: '102', name: 'Titan Trust Bank' },
	{ pattern: /UBA|UNITED\s*BANK\s*FOR\s*AFRICA/, code: '033', name: 'United Bank for Africa' },
	{ pattern: /UNION\s*BANK/, code: '032', name: 'Union Bank of Nigeria' },
	{ pattern: /UNITY\s*BANK/, code: '215', name: 'Unity Bank' },
	{ pattern: /WEMA/, code: '035', name: 'Wema Bank' },
	{ pattern: /ZENITH/, code: '057', name: 'Zenith Bank' },
	{ pattern: /OPAY/, code: '100004', name: 'OPay' },
	{ pattern: /PALMPAY/, code: '100033', name: 'PalmPay' },
	{ pattern: /KUDA|KUDA\s*MFB/, code: '090267', name: 'Kuda MFB' },
	{ pattern: /MONIEPOINT/, code: '090405', name: 'Moniepoint MFB' },
];

export function resolveBankCodeWithFallback(rawBank: string | null | undefined): string {
	if (!rawBank) return '';
	const live = resolveBankCode(rawBank);
	if (live) return live;

	const normalized = rawBank.trim().toUpperCase().replace(/\s+/g, ' ');
	const hit = CBN_BANK_CODES.find((entry) => entry.pattern.test(normalized));
	return hit ? hit.code : '';
}

// Fintech / payment-service banks (OPay, PalmPay, Kuda, Moniepoint, …) sit on
// the NIP instant-payment rails and have no 3-digit CBN sort code, so they get
// their own sheet in the workbook (no CODE column). Identified two ways: the
// resolved code is a long NIP-style code (more than 3 digits), or the bank
// name matches a static list when no code resolved.
const FINTECH_BANK_PATTERNS: RegExp[] = [
	/OPAY/,
	/PALM\s*PAY/,
	/KUDA/,
	/MONIE\s*POINT|TEAM\s*APT/,
	/MONNIFY/,
	/PAYSTACK/,
	/FLUTTER\s*WAVE/,
	/CARBON|ONE\s*FINANCE/,
	/FAIR\s*MONEY/,
	/SPARKLE/,
	/RUBIES/,
	/VFD/,
	/GLOBUS/,
];

export function isFintechBank(bankName: string | null | undefined, bankCode: string | null | undefined): boolean {
	const code = (bankCode || '').trim();
	if (code.length > 3) return true; // NIP-style instant-payment code

	const normalized = (bankName || '').trim().toUpperCase().replace(/\s+/g, ' ');
	if (!normalized) return false;
	return FINTECH_BANK_PATTERNS.some((pattern) => pattern.test(normalized));
}

// ---------------------------------------------------------------------------
// Schedule types
// ---------------------------------------------------------------------------

export type BankScheduleSourceType = 'upload' | 'generated';

export type BankScheduleRow = {
	staffRecordId: string;
	staffId: string;
	name: string;
	bankName: string;
	bankCode: string;
	accountNumber: string;
	netSalary: number;
	missingBankDetails: boolean;
	// Fintech/NIP banks have no 3-digit sort code — UI and workbook show no
	// CODE for these (the workbook puts them on their own sheet).
	isFintech: boolean;
};

export type BankGroup = {
	bankName: string;
	bankCode: string;
	staffCount: number;
	subtotal: number;
	rows: BankScheduleRow[];
};

export type BankSchedule = {
	sourceType: BankScheduleSourceType;
	sourceId: string;
	label: string;
	companyId: string;
	companyName: string;
	payPeriod: string;
	status: string;
	createdAt: Date;
	staffCount: number;
	totalNet: number;
	missingBankDetailsCount: number;
	groups: BankGroup[];
};

// Source-list entry shown in the frontend picker.
export type BankScheduleSource = {
	sourceType: BankScheduleSourceType;
	sourceId: string;
	label: string;
	companyId: string;
	companyName: string;
	payPeriod: string;
	status: string;
	staffCount: number;
	totalNet: number;
	createdAt: Date;
};

// ---------------------------------------------------------------------------
// Shared internals
// ---------------------------------------------------------------------------

type CustomFieldsLike = Record<string, CustomFieldValue>;

function toCustomFieldsMap(value: unknown): CustomFieldsLike | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as CustomFieldsLike;
}

export function toNumber(value: unknown): number {
	if (value === null || value === undefined) return 0;
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	if (typeof value === 'object' && value !== null && 'toString' in value) {
		const parsed = Number((value as any).toString());
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string): T[] {
	const seen = new Set<string>();
	return rows.filter((row) => {
		const key = keyFn(row);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

// One row per (staffRecordId, month, year) — the same dedup convention
// aggregatePayrollPeriod.ts uses, so re-uploads/overwrites never double-pay.
function buildRowsFromPayroll(
	payrolls: Array<{
		id: string;
		staffRecordId: string;
		month: string;
		year: number;
		netSalary: unknown;
		templateType: string | null;
		customFields: unknown;
		staffRecord: {
			staffId: string | null;
			firstName: string;
			lastName: string;
			bankName: string | null;
			accountNumber: string | null;
		} | null;
	}>
): BankScheduleRow[] {
	const deduped = dedupeByKey(payrolls, (p) => `${p.staffRecordId}-${p.month}-${p.year}`);

	return deduped.map((payroll) => {
		const staffRecord = payroll.staffRecord;
		let netSalary = toNumber(payroll.netSalary);

		// Dynamic templates may store everything inside customFields.
		if (!netSalary && payroll.templateType === 'DYNAMIC') {
			const customFields = toCustomFieldsMap(payroll.customFields);
			if (customFields) {
				const { earnings, deductions } = getPayslipDisplayFields(customFields);
				const totals = calculateTotals(earnings, deductions);
				netSalary = totals.netPay;
			}
		}

		const name = `${staffRecord?.firstName || ''} ${staffRecord?.lastName || ''}`.trim();
		const bankName = staffRecord?.bankName?.trim() || '';
		const accountNumber = staffRecord?.accountNumber?.trim() || '';

		const bankCode = resolveBankCodeWithFallback(bankName);

		return {
			staffRecordId: payroll.staffRecordId,
			staffId: staffRecord?.staffId || '',
			name,
			bankName,
			bankCode,
			accountNumber,
			netSalary,
			missingBankDetails: !bankName || !accountNumber,
			isFintech: isFintechBank(bankName, bankCode),
		};
	});
}

// The pay period a set of payroll rows belongs to — derived from the most
// common month/year among the rows (uploads can technically mix periods if
// the sheet did). Falls back to the first row's period.
function derivePeriodFromPayrolls(payrolls: Array<{ month: string; year: number }>): string {
	if (payrolls.length === 0) return 'Unknown period';
	const counts = new Map<string, number>();
	for (const p of payrolls) {
		const key = `${p.month} ${p.year}`;
		counts.set(key, (counts.get(key) || 0) + 1);
	}
	let best = '';
	let bestCount = 0;
	for (const [key, count] of counts) {
		if (count > bestCount) {
			best = key;
			bestCount = count;
		}
	}
	return best || 'Unknown period';
}

// "September 2026" → "Sep 2026" — compact label for Excel sheet/tab names.
// Passes through anything that doesn't start with a month-name word.
export function formatPeriodShort(payPeriod: string): string {
	const [first, ...rest] = (payPeriod || '').trim().split(/\s+/);
	if (first && rest.length > 0 && /^[A-Za-z]{3,}$/.test(first)) {
		return `${first.slice(0, 3)} ${rest.join(' ')}`;
	}
	return payPeriod;
}

function groupByBank(rows: BankScheduleRow[]): BankGroup[] {
	const groups = new Map<string, BankGroup>();
	for (const row of rows) {
		const key = (row.bankName || 'MISSING BANK DETAILS').toUpperCase();
		const group = groups.get(key) || {
			bankName: row.bankName || 'MISSING BANK DETAILS',
			bankCode: row.bankCode,
			staffCount: 0,
			subtotal: 0,
			rows: [],
		};
		group.staffCount += 1;
		group.subtotal += row.netSalary;
		group.rows.push(row);
		groups.set(key, group);
	}
	return Array.from(groups.values()).sort((a, b) => a.bankName.localeCompare(b.bankName));
}

// ---------------------------------------------------------------------------
// Source listing (frontend picker)
// ---------------------------------------------------------------------------

export async function listBankScheduleSources(companyIds: string[]): Promise<BankScheduleSource[]> {
	if (companyIds.length === 0) return [];

	const [uploads, runs] = await Promise.all([
		prisma.payrollUpload.findMany({
			where: { companyId: { in: companyIds }, status: 'COMPLETED' },
			include: { company: { select: { companyName: true } } },
			orderBy: { createdAt: 'desc' },
			take: 200,
		}),
		prisma.payrollGenerationRun.findMany({
			where: { companyId: { in: companyIds }, status: 'APPROVED' },
			include: { company: { select: { companyName: true } } },
			orderBy: { createdAt: 'desc' },
			take: 200,
		}),
	]);

	const sources: BankScheduleSource[] = [];

	for (const upload of uploads) {
		// Net/staff figures from the rows this upload actually produced — direct
		// link first, time-window fallback for pre-linkage uploads.
		const linkedCount = await prisma.payroll.count({ where: { payrollUploadId: upload.id } });
		let payrollWhere: any;
		if (linkedCount > 0) {
			payrollWhere = { payrollUploadId: upload.id };
		} else {
			payrollWhere = {
				companyId: upload.companyId,
				createdAt: {
					gte: upload.startedAt || upload.createdAt,
					lte: upload.completedAt || undefined,
				},
			};
		}
		const payrolls = await prisma.payroll.findMany({
			where: payrollWhere,
			select: {
				id: true,
				staffRecordId: true,
				month: true,
				year: true,
				netSalary: true,
				templateType: true,
				customFields: true,
				staffRecord: { select: { staffId: true, firstName: true, lastName: true, bankName: true, accountNumber: true } },
			},
		});
		const rows = buildRowsFromPayroll(payrolls as any);
		const payPeriod = derivePeriodFromPayrolls(payrolls);

		sources.push({
			sourceType: 'upload',
			sourceId: upload.id,
			label: `${upload.fileName} — ${payPeriod}`,
			companyId: upload.companyId,
			companyName: upload.company?.companyName || '',
			payPeriod,
			status: upload.status,
			staffCount: rows.length,
			totalNet: rows.reduce((sum, row) => sum + row.netSalary, 0),
			createdAt: upload.createdAt,
		});
	}

	for (const run of runs) {
		// Finalized rows produced by this generation run: PayrollData rows carry
		// payrollId → the generated Payroll records for the run's period.
		const payrollDataRows = await prisma.payrollData.findMany({
			where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod, payrollId: { not: null } },
			select: { payrollId: true },
			distinct: ['payrollId'],
		});
		const payrollIds = payrollDataRows.map((row) => row.payrollId).filter((id): id is string => !!id);
		const payrolls =
			payrollIds.length > 0
				? await prisma.payroll.findMany({
						where: { id: { in: payrollIds } },
						select: {
							id: true,
							staffRecordId: true,
							month: true,
							year: true,
							netSalary: true,
							templateType: true,
							customFields: true,
							staffRecord: { select: { staffId: true, firstName: true, lastName: true, bankName: true, accountNumber: true } },
						},
				  })
				: [];
		const rows = buildRowsFromPayroll(payrolls as any);

		sources.push({
			sourceType: 'generated',
			sourceId: run.id,
			label: `${run.payPeriod} — generation run`,
			companyId: run.companyId,
			companyName: run.company?.companyName || '',
			payPeriod: run.payPeriod,
			status: run.status,
			staffCount: rows.length,
			totalNet: rows.reduce((sum, row) => sum + row.netSalary, 0),
			createdAt: run.createdAt,
		});
	}

	return sources.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ---------------------------------------------------------------------------
// Schedule building (view + download)
// ---------------------------------------------------------------------------

export async function buildBankSchedule(sourceType: BankScheduleSourceType, sourceId: string, companyIds: string[]): Promise<BankSchedule | null> {
	if (sourceType === 'upload') {
		const upload = await prisma.payrollUpload.findUnique({
			where: { id: sourceId },
			include: { company: { select: { companyName: true } } },
		});
		if (!upload || !companyIds.includes(upload.companyId)) return null;

		// Direct link first; time-window fallback for pre-linkage uploads (same
		// heuristic the upload-cancel cleanup path uses).
		const linkedCount = await prisma.payroll.count({ where: { payrollUploadId: upload.id } });
		const payrollWhere: any =
			linkedCount > 0
				? { payrollUploadId: upload.id }
				: {
						companyId: upload.companyId,
						createdAt: {
							gte: upload.startedAt || upload.createdAt,
							lte: upload.completedAt || undefined,
						},
				  };
		const payrolls = await prisma.payroll.findMany({
			where: payrollWhere,
			select: {
				id: true,
				staffRecordId: true,
				month: true,
				year: true,
				netSalary: true,
				templateType: true,
				customFields: true,
				staffRecord: { select: { staffId: true, firstName: true, lastName: true, bankName: true, accountNumber: true } },
			},
		});
		const rows = buildRowsFromPayroll(payrolls as any);
		const payPeriod = derivePeriodFromPayrolls(payrolls);

		return {
			sourceType,
			sourceId,
			label: `${upload.fileName} — ${payPeriod}`,
			companyId: upload.companyId,
			companyName: upload.company?.companyName || '',
			payPeriod,
			status: upload.status,
			createdAt: upload.createdAt,
			staffCount: rows.length,
			totalNet: rows.reduce((sum, row) => sum + row.netSalary, 0),
			missingBankDetailsCount: rows.filter((row) => row.missingBankDetails).length,
			groups: groupByBank(rows),
		};
	}

	// generated
	const run = await prisma.payrollGenerationRun.findUnique({
		where: { id: sourceId },
		include: { company: { select: { companyName: true } } },
	});
	if (!run || !companyIds.includes(run.companyId)) return null;

	const payrollDataRows = await prisma.payrollData.findMany({
		where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod, payrollId: { not: null } },
		select: { payrollId: true },
		distinct: ['payrollId'],
	});
	const payrollIds = payrollDataRows.map((row) => row.payrollId).filter((id): id is string => !!id);
	const payrolls =
		payrollIds.length > 0
			? await prisma.payroll.findMany({
					where: { id: { in: payrollIds } },
					select: {
						id: true,
						staffRecordId: true,
						month: true,
						year: true,
						netSalary: true,
						templateType: true,
						customFields: true,
						staffRecord: { select: { staffId: true, firstName: true, lastName: true, bankName: true, accountNumber: true } },
					},
			  })
			: [];
	const rows = buildRowsFromPayroll(payrolls as any);

	return {
		sourceType,
		sourceId,
		label: `${run.payPeriod} — generation run`,
		companyId: run.companyId,
		companyName: run.company?.companyName || '',
		payPeriod: run.payPeriod,
		status: run.status,
		createdAt: run.createdAt,
		staffCount: rows.length,
		totalNet: rows.reduce((sum, row) => sum + row.netSalary, 0),
		missingBankDetailsCount: rows.filter((row) => row.missingBankDetails).length,
		groups: groupByBank(rows),
	};
}
