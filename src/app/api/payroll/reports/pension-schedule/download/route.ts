// src/app/api/payroll/reports/pension-schedule/download/route.ts
//
// Excel download for ONE specific payroll's Pension Schedule — shaped like
// docs/Pension Schedule template.xlsx. Two mutually exclusive sheets:
//   1. Pension Schedule    — the 14-column PenCom layout, staff with complete
//                            pension details only
//   2. Missing Details     — staff missing RSA PIN, PFA Code, or Employer
//                            Code (never duplicated onto the main sheet)
// Uses the shared reporting workbook builder (branded Summary sheet with
// KPIs) on top of the same core the on-screen view reads.
import { NextRequest, NextResponse } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { requireModuleAccess } from '@/app/lib/module-access';
import { buildPensionSchedule, buildPensionScheduleForStaff, type PensionGroup, type PensionScheduleSourceType } from '@/app/lib/payroll/reports/pension-schedule';
import { formatPeriodShort } from '@/app/lib/payroll/reports/bank-schedule';
import { getAccessibleCompanies } from '@/app/lib/reporting/access';
import { buildReportWorkbook } from '@/app/lib/reporting/excel-export';
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

const SCHEDULE_COLUMNS = [
	{ header: 'Employer Code', key: 'employerCode', type: 'text' as const, width: 16 },
	{ header: 'For The Month Of', key: 'month', type: 'text' as const, width: 16 },
	{ header: 'Year Of Contribution', key: 'year', type: 'plainNumber' as const, width: 10 },
	{ header: 'Staff ID', key: 'staffId', type: 'text' as const, width: 14 },
	{ header: 'RSA PIN', key: 'rsaPin', type: 'text' as const, width: 20 },
	{ header: 'Name of Employee', key: 'name', type: 'text' as const, width: 28 },
	{ header: 'Normal contribution for employee', key: 'normalEmployee', type: 'number' as const, width: 20 },
	{ header: 'Normal contribution for employer', key: 'normalEmployer', type: 'number' as const, width: 20 },
	{ header: 'Voluntary contribution by employee', key: 'voluntaryEmployee', type: 'number' as const, width: 20 },
	{ header: 'Voluntary contribution by employer', key: 'voluntaryEmployer', type: 'number' as const, width: 20 },
	{ header: 'Other Contribution', key: 'otherContribution', type: 'number' as const, width: 16 },
	{ header: 'TOTAL AMT.(Naira)', key: 'totalAmount', type: 'number' as const, width: 18 },
	{ header: 'Contribution Type/Code', key: 'contributionType', type: 'text' as const, width: 16 },
	{ header: 'PFA Code', key: 'pfaCode', type: 'text' as const, width: 14 },
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
		const staffRecordIds = (searchParams.get('staffRecordIds') || '').split(',').filter(Boolean);

		const accessibleCompanies = await getAccessibleCompanies(user);
		if (accessibleCompanies.length === 0) {
			return withCors(ApiResponse.error('No companies assigned to your account', 403), origin);
		}
		const accessibleCompanyIds = accessibleCompanies.map((c) => c.companyId);

		let companyId: string;
		let companyName: string;
		let periodLabel: string;
		let groups: PensionGroup[];
		let totalNormalEmployee: number;
		let totalNormalEmployer: number;
		let staffCount: number;
		let missingPensionDetailsCount: number;

		if (staffRecordIds.length > 0) {
			// "By staff" mode — a chosen set of staff across a month/year range.
			const requestedCompanyId = searchParams.get('companyId');
			const fromMonth = parseInt(searchParams.get('fromMonth') || '', 10);
			const fromYear = parseInt(searchParams.get('fromYear') || '', 10);
			const toMonth = parseInt(searchParams.get('toMonth') || '', 10);
			const toYear = parseInt(searchParams.get('toYear') || '', 10);

			if (!requestedCompanyId) {
				return withCors(ApiResponse.error('companyId is required', 400), origin);
			}
			if ([fromMonth, fromYear, toMonth, toYear].some((n) => !Number.isFinite(n))) {
				return withCors(ApiResponse.error('fromMonth, fromYear, toMonth, toYear are required and must be numbers', 400), origin);
			}

			const schedule = await buildPensionScheduleForStaff({ staffRecordIds, companyId: requestedCompanyId, fromMonth, fromYear, toMonth, toYear }, accessibleCompanyIds);
			if (!schedule) {
				return withCors(ApiResponse.error('No accessible payroll data found for the selected staff/period', 404), origin);
			}

			companyId = schedule.companyId;
			companyName = schedule.companyName;
			periodLabel = schedule.periodLabel;
			groups = schedule.groups;
			totalNormalEmployee = schedule.totalNormalEmployee;
			totalNormalEmployer = schedule.totalNormalEmployer;
			staffCount = schedule.staffCount;
			missingPensionDetailsCount = schedule.missingPensionDetailsCount;
		} else {
			// "By payroll run" mode — one specific upload/generation run.
			const sourceType = (searchParams.get('sourceType') || '').toLowerCase();
			const sourceId = searchParams.get('sourceId');

			if (sourceType !== 'upload' && sourceType !== 'generated') {
				return withCors(ApiResponse.error('sourceType must be "upload" or "generated"', 400), origin);
			}
			if (!sourceId) {
				return withCors(ApiResponse.error('sourceId is required', 400), origin);
			}

			const schedule = await buildPensionSchedule(sourceType as PensionScheduleSourceType, sourceId, accessibleCompanyIds);
			if (!schedule) {
				return withCors(ApiResponse.error('Payroll source not found or not accessible', 404), origin);
			}

			companyId = schedule.companyId;
			companyName = schedule.companyName;
			periodLabel = formatPeriodShort(schedule.payPeriod);
			groups = schedule.groups;
			totalNormalEmployee = schedule.totalNormalEmployee;
			totalNormalEmployer = schedule.totalNormalEmployer;
			staffCount = schedule.staffCount;
			missingPensionDetailsCount = schedule.missingPensionDetailsCount;
		}

		const currency = await resolveReportCurrency([companyId]);

		const scheduleRows: Array<Record<string, unknown>> = [];
		const missingRows: Array<Record<string, unknown>> = [];
		for (const group of groups) {
			for (const row of group.rows) {
				const record = {
					employerCode: row.employerCode,
					month: row.month,
					year: row.year,
					staffId: row.staffId,
					rsaPin: row.rsaPin,
					name: row.name,
					normalEmployee: row.normalEmployee,
					normalEmployer: row.normalEmployer,
					voluntaryEmployee: row.voluntaryEmployee,
					voluntaryEmployer: row.voluntaryEmployer,
					otherContribution: row.otherContribution,
					totalAmount: row.totalAmount,
					contributionType: row.contributionType,
					pfaCode: row.pfaCode,
				};
				if (row.missingPensionDetails) {
					missingRows.push(record);
				} else {
					scheduleRows.push(record);
				}
			}
		}

		const buffer = await buildReportWorkbook({
			title: 'Pension Schedule',
			companyName,
			currency: currency.code === 'MIXED' ? 'NGN' : currency.code,
			kpis: [
				{ label: 'Total Employee Contribution', value: totalNormalEmployee },
				{ label: 'Total Employer Contribution', value: totalNormalEmployer },
				{ label: 'Staff on Schedule', value: staffCount },
				{ label: 'Missing Pension Details', value: missingPensionDetailsCount },
			],
			sheets: [
				{
					name: `Pension Schedule (${periodLabel})`,
					displayTitle: `${periodLabel} Pension Schedule`,
					columns: SCHEDULE_COLUMNS,
					rows: scheduleRows,
					totals: false,
				},
				...(missingRows.length > 0
					? [
							{
								name: `Missing Details (${periodLabel})`,
								displayTitle: `${periodLabel} Missing Pension Details`,
								columns: SCHEDULE_COLUMNS,
								rows: missingRows,
								totals: false,
							},
					  ]
					: []),
			],
		});

		const safeCompany = safeFileName(companyName || 'Company');
		const filename = `Pension Schedule (${safeCompany}) ${safeFileName(periodLabel)}.xlsx`;

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
