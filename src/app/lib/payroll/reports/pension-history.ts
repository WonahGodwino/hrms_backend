// src/app/lib/payroll/reports/pension-history.ts
//
// Pension compliance history/gap-detection — "was this staff member missing
// RSA PIN/PFA Code/Employer Code during month X, and when did it get fixed?"
//
// This is only answerable for Payroll rows created AFTER the pension
// snapshot columns shipped (Payroll.pensionRsaPinSnapshot/pensionPfaCodeSnapshot/
// pensionEmployerCodeSnapshot/pensionSnapshotAt — see finalize-generated-payroll.ts
// and the 3 upload template processors, which populate them at creation time).
// StaffRecord itself is never versioned, so older Payroll rows simply have no
// snapshot: those periods are reported as "not tracked", never guessed at as
// complete or missing.
import { prisma } from '@/app/lib/db';
import { monthNameToNumber } from '@/app/lib/payroll/utils/valueParsing';

export type PensionHistoryEntry = {
	payrollId: string;
	month: string;
	year: number;
	monthIndex: number; // year * 12 + monthNumber(1-12) — sortable/comparable across years
	rsaPin: string;
	pfaCode: string;
	employerCode: string;
	hasSnapshot: boolean;
	missingPensionDetails: boolean;
};

export type PensionGapSegment = {
	fromMonth: string;
	fromYear: number;
	toMonth: string;
	toYear: number;
	resolvedMonth: string | null;
	resolvedYear: number | null;
	ongoing: boolean;
};

export type StaffPensionHistory = {
	staffRecordId: string;
	staffId: string;
	name: string;
	companyPensionEmployerCode: string;
	entries: PensionHistoryEntry[];
	gaps: PensionGapSegment[];
};

export type CompanyPensionGapSummary = {
	staffRecordId: string;
	staffId: string;
	name: string;
	gaps: PensionGapSegment[];
};

type PayrollSnapshotRow = {
	id: string;
	month: string;
	year: number;
	createdAt: Date;
	pensionRsaPinSnapshot: string | null;
	pensionPfaCodeSnapshot: string | null;
	pensionEmployerCodeSnapshot: string | null;
	pensionSnapshotAt: Date | null;
};

function toMonthIndex(month: string, year: number): number {
	const monthNumber = monthNameToNumber(month) || 1;
	return year * 12 + monthNumber;
}

// One entry per (month, year) — a re-run/re-approval updates the Payroll row
// in place, but legacy data could in theory have duplicates; keep the latest.
function dedupeAndSortByPeriod(rows: PayrollSnapshotRow[]): PayrollSnapshotRow[] {
	const byPeriod = new Map<string, PayrollSnapshotRow>();
	for (const row of rows) {
		const key = `${row.year}-${row.month}`;
		const existing = byPeriod.get(key);
		if (!existing || row.createdAt > existing.createdAt) byPeriod.set(key, row);
	}
	return Array.from(byPeriod.values()).sort((a, b) => toMonthIndex(a.month, a.year) - toMonthIndex(b.month, b.year));
}

function toEntry(row: PayrollSnapshotRow): PensionHistoryEntry {
	const hasSnapshot = row.pensionSnapshotAt !== null;
	const rsaPin = row.pensionRsaPinSnapshot?.trim() || '';
	const pfaCode = row.pensionPfaCodeSnapshot?.trim() || '';
	const employerCode = row.pensionEmployerCodeSnapshot?.trim() || '';

	return {
		payrollId: row.id,
		month: row.month,
		year: row.year,
		monthIndex: toMonthIndex(row.month, row.year),
		rsaPin,
		pfaCode,
		employerCode,
		hasSnapshot,
		missingPensionDetails: hasSnapshot && (!rsaPin || !pfaCode || !employerCode),
	};
}

// Finds consecutive runs of missing (tracked) periods and whether/when each
// run was resolved by the next tracked period. "Not tracked" periods neither
// start nor break a gap — they're simply skipped when walking the timeline.
function detectGaps(entries: PensionHistoryEntry[]): PensionGapSegment[] {
	const tracked = entries.filter((e) => e.hasSnapshot);
	const gaps: PensionGapSegment[] = [];

	let gapStart: PensionHistoryEntry | null = null;
	let gapEnd: PensionHistoryEntry | null = null;

	for (const entry of tracked) {
		if (entry.missingPensionDetails) {
			if (!gapStart) gapStart = entry;
			gapEnd = entry;
		} else if (gapStart && gapEnd) {
			gaps.push({
				fromMonth: gapStart.month,
				fromYear: gapStart.year,
				toMonth: gapEnd.month,
				toYear: gapEnd.year,
				resolvedMonth: entry.month,
				resolvedYear: entry.year,
				ongoing: false,
			});
			gapStart = null;
			gapEnd = null;
		}
	}

	if (gapStart && gapEnd) {
		gaps.push({
			fromMonth: gapStart.month,
			fromYear: gapStart.year,
			toMonth: gapEnd.month,
			toYear: gapEnd.year,
			resolvedMonth: null,
			resolvedYear: null,
			ongoing: true,
		});
	}

	return gaps;
}

const SNAPSHOT_SELECT = {
	id: true,
	month: true,
	year: true,
	createdAt: true,
	pensionRsaPinSnapshot: true,
	pensionPfaCodeSnapshot: true,
	pensionEmployerCodeSnapshot: true,
	pensionSnapshotAt: true,
} as const;

export async function getStaffPensionHistory(staffRecordId: string, companyId: string): Promise<StaffPensionHistory | null> {
	const staffRecord = await prisma.staffRecord.findFirst({
		where: { id: staffRecordId, companyId },
		select: { id: true, staffId: true, firstName: true, lastName: true, company: { select: { pensionEmployerCode: true } } },
	});
	if (!staffRecord) return null;

	const payrolls = (await prisma.payroll.findMany({
		where: { staffRecordId, companyId },
		select: SNAPSHOT_SELECT,
	})) as PayrollSnapshotRow[];

	const ordered = dedupeAndSortByPeriod(payrolls);
	const entries = ordered.map(toEntry);

	return {
		staffRecordId: staffRecord.id,
		staffId: staffRecord.staffId || '',
		name: `${staffRecord.firstName} ${staffRecord.lastName}`.trim(),
		companyPensionEmployerCode: staffRecord.company?.pensionEmployerCode || '',
		entries,
		gaps: detectGaps(entries),
	};
}

export async function getCompanyPensionGaps(companyId: string): Promise<CompanyPensionGapSummary[]> {
	const payrolls = (await prisma.payroll.findMany({
		where: { companyId },
		select: { ...SNAPSHOT_SELECT, staffRecordId: true },
	})) as Array<PayrollSnapshotRow & { staffRecordId: string }>;

	const byStaff = new Map<string, PayrollSnapshotRow[]>();
	for (const row of payrolls) {
		const list = byStaff.get(row.staffRecordId) || [];
		list.push(row);
		byStaff.set(row.staffRecordId, list);
	}

	const staffIds = Array.from(byStaff.keys());
	if (staffIds.length === 0) return [];

	const staffRecords = await prisma.staffRecord.findMany({
		where: { id: { in: staffIds } },
		select: { id: true, staffId: true, firstName: true, lastName: true },
	});
	const staffById = new Map(staffRecords.map((s) => [s.id, s]));

	const summaries: CompanyPensionGapSummary[] = [];
	for (const [staffRecordId, rows] of byStaff) {
		const entries = dedupeAndSortByPeriod(rows).map(toEntry);
		const gaps = detectGaps(entries);
		if (gaps.length === 0) continue;

		const staff = staffById.get(staffRecordId);
		summaries.push({
			staffRecordId,
			staffId: staff?.staffId || '',
			name: staff ? `${staff.firstName} ${staff.lastName}`.trim() : '',
			gaps,
		});
	}

	// Staff with an ongoing (unresolved) gap surface first.
	return summaries.sort((a, b) => {
		const aOngoing = a.gaps.some((g) => g.ongoing) ? 1 : 0;
		const bOngoing = b.gaps.some((g) => g.ongoing) ? 1 : 0;
		if (aOngoing !== bOngoing) return bOngoing - aOngoing;
		return a.name.localeCompare(b.name);
	});
}
