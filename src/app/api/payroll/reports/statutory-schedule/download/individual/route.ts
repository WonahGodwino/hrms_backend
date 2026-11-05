// src/app/api/payroll/reports/statutory-schedule/download/individual/route.ts
//
// Excel for ONE statutory scheme (NSITF, ITF, or NHF) on one payroll, split
// the same way the Pension Schedule download splits its one scheme:
//   1. "<Scheme> (<period>)"          — staff covered for the scheme.
//   2. "<Scheme> Skipped (<period>)"  — staff skipped (never duplicated onto
//                                        the first sheet).
// A sibling of ../route.ts, which stays the combined, all-schemes download.
import { NextRequest, NextResponse } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { requireModuleAccess } from '@/app/lib/module-access';
import { buildStatutorySchedule, NSITF_SCHEDULE_COLUMN_DEFS, toNsitfScheduleRecord, nsitfMissingFlags } from '@/app/lib/payroll/reports/statutory-schedule';
import { formatPeriodShort } from '@/app/lib/payroll/reports/bank-schedule';
import { STATUTORY_SCHEMES, type StatutoryScheme } from '@/app/lib/payroll/statutory-columns';
import { getAccessibleCompanies } from '@/app/lib/reporting/access';
import { buildReportWorkbook, type ReportColumn } from '@/app/lib/reporting/excel-export';
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

const SCHEME_LABEL: Record<StatutoryScheme, string> = { nsitf: 'NSITF', itf: 'ITF', nhf: 'NHF' };
const SCHEME_FULL: Record<StatutoryScheme, string> = {
	nsitf: 'Nigeria Social Insurance Trust Fund',
	itf: 'Industrial Training Fund',
	nhf: 'National Housing Fund',
};

const columnsFor = (scheme: StatutoryScheme): ReportColumn[] => [
	{ header: 'Staff ID', key: 'staffId', type: 'text', width: 14 },
	{ header: 'Name of Employee', key: 'name', type: 'text', width: 28 },
	{ header: 'Department', key: 'department', type: 'text', width: 20 },
	{ header: scheme === 'nhf' ? 'Basic' : 'Gross', key: 'base', type: 'number', width: 16 },
	{ header: `${SCHEME_LABEL[scheme]} Amount`, key: 'amount', type: 'number', width: 16 },
];

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}
		const token = authHeader.replace('Bearer ', '');
		const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN']);

		const { searchParams } = new URL(request.url);
		const sourceType = (searchParams.get('sourceType') || '').toLowerCase();
		const sourceId = searchParams.get('sourceId');
		const scheme = (searchParams.get('scheme') || '').toLowerCase() as StatutoryScheme;
		if (sourceType !== 'upload' && sourceType !== 'generated') {
			return withCors(ApiResponse.error('sourceType must be "upload" or "generated"', 400), origin);
		}
		if (!sourceId) {
			return withCors(ApiResponse.error('sourceId is required', 400), origin);
		}
		if (!STATUTORY_SCHEMES.includes(scheme)) {
			return withCors(ApiResponse.error('scheme must be "nsitf", "itf", or "nhf"', 400), origin);
		}

		const accessibleCompanies = await getAccessibleCompanies(user);
		if (accessibleCompanies.length === 0) {
			return withCors(ApiResponse.error('No companies assigned to your account', 403), origin);
		}

		const schedule = await buildStatutorySchedule(sourceType, sourceId, accessibleCompanies.map((c) => c.companyId));
		if (!schedule) {
			return withCors(ApiResponse.error('Payroll source not found or not accessible', 404), origin);
		}
		if (!schedule.schemes[scheme].inForce) {
			return withCors(ApiResponse.error(`${SCHEME_LABEL[scheme]} is not set up on this payroll`, 400), origin);
		}

		const currency = await resolveReportCurrency([schedule.companyId]);
		const periodLabel = formatPeriodShort(schedule.payPeriod);
		const label = SCHEME_LABEL[scheme];

		let sheets: Array<{ name: string; displayTitle: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; totals: boolean }>;
		let kpis: Array<{ label: string; value: string | number }>;

		if (scheme === 'nsitf') {
			// Official "Employees' Schedule of Payments" columns, split into a
			// covered sheet and a (never duplicated) Missing Details sheet — the
			// same pattern as the Pension Schedule download's Missing Details split.
			const coveredRows = schedule.rows.filter((r) => !r.missingNsitfDetails && r.status.nsitf !== 'skipped');
			const flaggedRows = schedule.rows.filter((r) => r.missingNsitfDetails || r.status.nsitf === 'skipped');
			const missingColumns: ReportColumn[] = [...NSITF_SCHEDULE_COLUMN_DEFS, { header: 'FLAGS', key: 'flags', type: 'text', width: 30 }];
			sheets = [
				{
					name: `${label} (${periodLabel})`,
					displayTitle: `${periodLabel} ${SCHEME_FULL[scheme]} (${label}) Schedule`,
					columns: NSITF_SCHEDULE_COLUMN_DEFS,
					rows: coveredRows.map((r, i) => toNsitfScheduleRecord(r, i)),
					totals: false,
				},
				...(flaggedRows.length > 0
					? [
							{
								name: `${label} Missing Details (${periodLabel})`,
								displayTitle: `${periodLabel} ${label} Missing Details`,
								columns: missingColumns,
								rows: flaggedRows.map((r, i) => ({ ...toNsitfScheduleRecord(r, i), flags: nsitfMissingFlags(r).join(', ') })),
								totals: false,
							},
						]
					: []),
			];
			kpis = [
				{ label: `Total ${label}`, value: schedule.schemes[scheme].total },
				{ label: 'Staff Covered', value: coveredRows.length },
				{ label: 'Staff Flagged', value: flaggedRows.length },
			];
		} else {
			const toRow = (r: (typeof schedule.rows)[number]) => ({
				staffId: r.staffId,
				name: r.name,
				department: r.department,
				base: scheme === 'nhf' ? r.basic : r.gross,
				amount: r.amounts[scheme],
			});
			const coveredRows = schedule.rows.filter((r) => r.status[scheme] === 'covered').map(toRow);
			const skippedRows = schedule.rows.filter((r) => r.status[scheme] === 'skipped').map(toRow);
			sheets = [
				{
					name: `${label} (${periodLabel})`,
					displayTitle: `${periodLabel} ${SCHEME_FULL[scheme]} (${label}) Schedule`,
					columns: columnsFor(scheme),
					rows: coveredRows,
					totals: false,
				},
				...(skippedRows.length > 0
					? [
							{
								name: `${label} Skipped (${periodLabel})`,
								displayTitle: `${periodLabel} ${label} Skipped`,
								columns: columnsFor(scheme),
								rows: skippedRows,
								totals: false,
							},
						]
					: []),
			];
			kpis = [
				{ label: `Total ${label}`, value: schedule.schemes[scheme].total },
				{ label: 'Staff Covered', value: coveredRows.length },
				{ label: 'Staff Skipped', value: skippedRows.length },
			];
		}

		const buffer = await buildReportWorkbook({
			title: `${label} Schedule`,
			subtitle: periodLabel,
			companyName: schedule.companyName,
			currency: currency.code === 'MIXED' ? 'NGN' : currency.code,
			kpis,
			sheets,
		});

		const filename = `${label} Schedule (${safeFileName(schedule.companyName || 'Company')}) ${safeFileName(periodLabel)}.xlsx`;
		return withCors(
			new NextResponse(buffer as any, {
				status: 200,
				headers: {
					'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					'Content-Disposition': attachmentDisposition(filename),
				},
			}),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
