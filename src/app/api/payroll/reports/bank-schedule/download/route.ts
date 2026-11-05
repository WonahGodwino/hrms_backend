// src/app/api/payroll/reports/bank-schedule/download/route.ts
//
// Excel download for ONE specific payroll's Bank Schedule — shaped like the
// docs/bank-schedule.xlsx reference: NAME | BANK NAME | ACCOUNT NUMBER |
// NET SALARY | CODE. Three sheets, none with a totals row:
//   1. Bank Schedule      — traditional banks (with CODE)
//   2. Fintech Banks      — fintech/MFB banks (no CODE — they have no sort code)
//   3. Missing Details    — staff missing bank name or account number
// Uses the shared reporting workbook builder (branded Summary sheet with KPIs)
// on top of the same core the on-screen view reads.
import { NextRequest, NextResponse } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { requireModuleAccess } from '@/app/lib/module-access';
import { BankScheduleSourceType, buildBankSchedule, formatPeriodShort, isFintechBank } from '@/app/lib/payroll/reports/bank-schedule';
import { getAccessibleCompanies } from '@/app/lib/reporting/access';
import { buildReportWorkbook } from '@/app/lib/reporting/excel-export';
import { resolveReportCurrency } from '@/app/lib/reporting/resolveCurrency';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { attachmentDisposition, safeFileName } from '@/app/lib/excel/sheet-theme';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

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

		const schedule = await buildBankSchedule(
			sourceType as BankScheduleSourceType,
			sourceId,
			accessibleCompanies.map((c) => c.companyId)
		);
		if (!schedule) {
			return withCors(ApiResponse.error('Payroll source not found or not accessible', 404), origin);
		}

		const currency = await resolveReportCurrency([schedule.companyId]);

		// Split into the three sheet buckets, in the sample sheet's column order.
		const bankRows: Array<Record<string, unknown>> = [];
		const fintechRows: Array<Record<string, unknown>> = [];
		const missingRows: Array<Record<string, unknown>> = [];
		for (const group of schedule.groups) {
			for (const row of group.rows) {
				if (row.missingBankDetails) {
					missingRows.push({
						name: row.name,
						bankName: 'MISSING BANK DETAILS',
						accountNumber: row.accountNumber,
						netSalary: row.netSalary,
						code: row.bankCode,
					});
				} else if (isFintechBank(row.bankName, row.bankCode)) {
					fintechRows.push({
						name: row.name,
						bankName: row.bankName,
						accountNumber: row.accountNumber,
						netSalary: row.netSalary,
					});
				} else {
					bankRows.push({
						name: row.name,
						bankName: row.bankName,
						accountNumber: row.accountNumber,
						netSalary: row.netSalary,
						code: row.bankCode,
					});
				}
			}
		}

		const buffer = await buildReportWorkbook({
			title: 'Bank Schedule',
			// No subtitle — the meta row already ends with "Generated: <date>", and
			// the source label would just repeat the pay period there.
			companyName: schedule.companyName,
			currency: currency.code === 'MIXED' ? 'NGN' : currency.code,
			kpis: [
				{ label: 'Total Net Payable', value: schedule.totalNet },
				{ label: 'Staff on Schedule', value: schedule.staffCount },
				{ label: 'Banks', value: schedule.groups.filter((g) => g.bankName !== 'MISSING BANK DETAILS').length },
				{ label: 'Missing Bank Details', value: schedule.missingBankDetailsCount },
			],
			sheets: [
				{
					name: `Bank Schedule (${formatPeriodShort(schedule.payPeriod)})`,
					displayTitle: `${schedule.payPeriod} Bank Schedule`,
					columns: [
						{ header: 'NAME', key: 'name', type: 'text', width: 30 },
						{ header: 'BANK NAME', key: 'bankName', type: 'text', width: 24 },
						{ header: 'ACCOUNT NUMBER', key: 'accountNumber', type: 'text', width: 20 },
						{ header: 'NET SALARY', key: 'netSalary', type: 'currency', width: 18 },
						{ header: 'CODE', key: 'code', type: 'text', width: 10 },
					],
					rows: bankRows,
					totals: false,
				},
				...(fintechRows.length > 0
					? [
							{
								name: `Fintech Banks (${formatPeriodShort(schedule.payPeriod)})`,
								displayTitle: `${schedule.payPeriod} Fintech Banks`,
								// Same format as the main sheet, minus CODE — fintechs
								// ride the NIP rails and have no sort code.
								columns: [
									{ header: 'NAME', key: 'name', type: 'text' as const, width: 30 },
									{ header: 'BANK NAME', key: 'bankName', type: 'text' as const, width: 24 },
									{ header: 'ACCOUNT NUMBER', key: 'accountNumber', type: 'text' as const, width: 20 },
									{ header: 'NET SALARY', key: 'netSalary', type: 'currency' as const, width: 18 },
								],
								rows: fintechRows,
								totals: false,
							},
					  ]
					: []),
				...(missingRows.length > 0
					? [
							{
								name: `Missing Details (${formatPeriodShort(schedule.payPeriod)})`,
								displayTitle: `${schedule.payPeriod} Missing Bank Details`,
								// Same columns as the main bank schedule sheet.
								columns: [
									{ header: 'NAME', key: 'name', type: 'text' as const, width: 30 },
									{ header: 'BANK NAME', key: 'bankName', type: 'text' as const, width: 24 },
									{ header: 'ACCOUNT NUMBER', key: 'accountNumber', type: 'text' as const, width: 20 },
									{ header: 'NET SALARY', key: 'netSalary', type: 'currency' as const, width: 18 },
									{ header: 'CODE', key: 'code', type: 'text' as const, width: 10 },
								],
								rows: missingRows,
								totals: false,
							},
					  ]
					: []),
			],
		});

		const safeCompany = safeFileName(schedule.companyName || 'Company');
		const filename = `Bank Schedule (${safeCompany}) ${safeFileName(formatPeriodShort(schedule.payPeriod))}.xlsx`;

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
