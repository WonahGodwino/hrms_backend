// src/app/api/payroll/reports/statutory-schedule/download/route.ts
//
// Excel version of the statutory schedule for one payroll: a Summary sheet
// (KPIs plus the 12-month trend chart), one sheet per scheme that is in force
// (NSITF, ITF, NHF) with every staff row, and a Coverage Gaps sheet listing
// staff skipped for a scheme this month.
import { NextRequest, NextResponse } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { requireModuleAccess } from '@/app/lib/module-access';
import { buildStatutorySchedule, buildStatutoryTrend, NSITF_SCHEDULE_COLUMN_DEFS, toNsitfScheduleRecord, nsitfMissingFlags } from '@/app/lib/payroll/reports/statutory-schedule';
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
const STATUS_LABEL = { covered: 'Covered', skipped: 'Skipped', not_tracked: 'Not tracked' } as const;

const schemeColumns = (scheme: StatutoryScheme): ReportColumn[] => [
	{ header: 'Staff ID', key: 'staffId', type: 'text', width: 14 },
	{ header: 'Name of Employee', key: 'name', type: 'text', width: 28 },
	{ header: 'Department', key: 'department', type: 'text', width: 20 },
	{ header: scheme === 'nhf' ? 'Basic' : 'Gross', key: 'base', type: 'number', width: 16 },
	{ header: `${SCHEME_LABEL[scheme]} Amount`, key: 'amount', type: 'number', width: 16 },
	{ header: 'Status', key: 'status', type: 'text', width: 14 },
];

const GAP_COLUMNS: ReportColumn[] = [
	{ header: 'Staff ID', key: 'staffId', type: 'text', width: 14 },
	{ header: 'Name of Employee', key: 'name', type: 'text', width: 28 },
	{ header: 'Department', key: 'department', type: 'text', width: 20 },
	{ header: 'Skipped', key: 'schemes', type: 'text', width: 22 },
];

const NSITF_MISSING_COLUMNS: ReportColumn[] = [...NSITF_SCHEDULE_COLUMN_DEFS, { header: 'FLAGS', key: 'flags', type: 'text', width: 30 }];

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
		if (sourceType !== 'upload' && sourceType !== 'generated') {
			return withCors(ApiResponse.error('sourceType must be "upload" or "generated"', 400), origin);
		}
		if (!sourceId) {
			return withCors(ApiResponse.error('sourceId is required', 400), origin);
		}

		const accessibleCompanies = await getAccessibleCompanies(user);
		if (accessibleCompanies.length === 0) {
			return withCors(ApiResponse.error('No companies assigned to your account', 403), origin);
		}

		const schedule = await buildStatutorySchedule(sourceType, sourceId, accessibleCompanies.map((c) => c.companyId));
		if (!schedule) {
			return withCors(ApiResponse.error('Payroll source not found or not accessible', 404), origin);
		}

		const [currency, trend] = await Promise.all([
			resolveReportCurrency([schedule.companyId]),
			buildStatutoryTrend({ companyIds: [schedule.companyId], endYear: schedule.year, endMonth: schedule.month, months: 12 }),
		]);
		const periodLabel = formatPeriodShort(schedule.payPeriod);
		const activeSchemes = STATUTORY_SCHEMES.filter((s) => schedule.schemes[s].inForce);

		const gapRows = schedule.rows
			.filter((r) => activeSchemes.some((s) => r.status[s] === 'skipped'))
			.map((r) => ({ staffId: r.staffId, name: r.name, department: r.department, schemes: activeSchemes.filter((s) => r.status[s] === 'skipped').map((s) => SCHEME_LABEL[s]).join(', ') }));

		const buffer = await buildReportWorkbook({
			title: 'NSITF, ITF and NHF Schedule',
			subtitle: periodLabel,
			companyName: schedule.companyName,
			currency: currency.code === 'MIXED' ? 'NGN' : currency.code,
			kpis: [
				...STATUTORY_SCHEMES.map((s) => ({ label: `Total ${SCHEME_LABEL[s]}`, value: schedule.schemes[s].inForce ? schedule.schemes[s].total : 'Not set up' })),
				{ label: 'Staff on Payroll', value: schedule.staffCount },
				{ label: 'Staff Skipped (any scheme)', value: gapRows.length },
			],
			charts:
				trend.points.length > 1
					? [
							{
								type: 'bar',
								title: 'NSITF, ITF and NHF by month (last 12 months)',
								labels: trend.points.map((p) => p.label),
								series: STATUTORY_SCHEMES.map((s) => ({ name: SCHEME_LABEL[s], values: trend.points.map((p) => p[s]) })),
							},
						]
					: [],
			sheets: [
				...activeSchemes.flatMap((scheme): Array<{ name: string; displayTitle: string; columns: ReportColumn[]; rows: Record<string, unknown>[]; totals?: boolean }> => {
					if (scheme !== 'nsitf') {
						return [
							{
								name: `${SCHEME_LABEL[scheme]} (${periodLabel})`,
								displayTitle: `${periodLabel} ${SCHEME_LABEL[scheme]} Schedule`,
								columns: schemeColumns(scheme),
								rows: schedule.rows.map((r) => ({
									staffId: r.staffId,
									name: r.name,
									department: r.department,
									base: scheme === 'nhf' ? r.basic : r.gross,
									amount: r.amounts[scheme],
									status: STATUS_LABEL[r.status[scheme]],
								})),
							},
						];
					}
					// NSITF uses the official "Employees' Schedule of Payments" columns,
					// split into a covered sheet and a (never duplicated) Missing
					// Details sheet — the same pattern the Pension Schedule download
					// uses for its Missing Details sheet.
					const coveredRows = schedule.rows.filter((r) => !r.missingNsitfDetails && r.status.nsitf !== 'skipped');
					const flaggedRows = schedule.rows.filter((r) => r.missingNsitfDetails || r.status.nsitf === 'skipped');
					return [
						{
							name: `NSITF (${periodLabel})`,
							displayTitle: `${periodLabel} NSITF Employees' Schedule of Payments`,
							columns: NSITF_SCHEDULE_COLUMN_DEFS,
							rows: coveredRows.map((r, i) => toNsitfScheduleRecord(r, i)),
							totals: false,
						},
						...(flaggedRows.length > 0
							? [
									{
										name: `NSITF Missing Details (${periodLabel})`,
										displayTitle: `${periodLabel} NSITF Missing Details`,
										columns: NSITF_MISSING_COLUMNS,
										rows: flaggedRows.map((r, i) => ({ ...toNsitfScheduleRecord(r, i), flags: nsitfMissingFlags(r).join(', ') })),
										totals: false,
									},
								]
							: []),
					];
				}),
				...(gapRows.length > 0 ? [{ name: `Coverage Gaps (${periodLabel})`, displayTitle: `${periodLabel} Staff Skipped`, columns: GAP_COLUMNS, rows: gapRows, totals: false }] : []),
			],
		});

		const filename = `Statutory Schedule (${safeFileName(schedule.companyName || 'Company')}) ${safeFileName(periodLabel)}.xlsx`;
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
