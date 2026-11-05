// src/app/lib/payroll/generation/finalize-generated-payroll.ts
//
// "Approve" step for a Payroll Generation run — turns its reviewed
// PayrollData rows into real Payroll + Payslip records with a rendered PDF,
// exactly like the manual upload path does, so the result is immediately
// visible in the existing, untouched payslip viewers/reports. Deliberately
// duplicates (rather than imports/shares) the equivalent tail of
// dynamic-processor.ts — see the Payroll Generation plan for why: nothing
// about the proven manual upload path should be able to regress from this
// feature touching it.
//
// finalizeOneStaffRow is also the mechanism behind post-approval edits: the
// Payroll/Payslip upserts below are idempotent, keyed by
// staffRecordId+month+year+companyId (not by "does one already exist"), so
// calling this again for a staff who was already approved updates their
// existing real records and regenerates the same PDF in place rather than
// creating a duplicate. Row-level edits, Recompute, and Include all call it
// directly for exactly this reason once a run is APPROVED — see
// rows/[staffId]/route.ts, recompute/route.ts, include/route.ts.
import { prisma } from '@/app/lib/db';
import { sendPayrollNotificationEmail } from '@/app/lib/email';
import { createNotification } from '@/app/lib/notifications/helpers';

import { generateEnhancedPayslipPdf, type GeneratePayslipInput } from '../generateEnhancedPayslipPdf';
import { generatePayslipPdfUnified, getActivePresetHtml } from '../payslip-preset-renderer';
import { watermarkPdfIfTrial } from '@/app/lib/trial/watermark';
import { monthNameToNumber } from '../utils/valueParsing';
import { findDaysInMonthField, findDaysWorkedField } from './field-resolver';
import { markDueLoanRepaymentsPaid } from '@/app/lib/staff-loans-benefits/payroll-integration';

import type { PayrollTemplate, PayrollTemplateField, StaffRecord, PayrollData } from '@prisma/client';

const RESERVED_STAFF_DETAIL_FIELDS = new Set(['staff_id', 'employee_name', 'employee_email', 'month', 'department']);

function normalizeSection(section: string): string {
	return (section || '').toUpperCase().replace(/[\s-]+/g, '_');
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// Maps a resolved field's systemField to the SYSTEM_CALC calculator that
// produced it, read from the template's own field definitions (not guessed
// from the field's name) — a structural lookup that keeps working no matter
// what a company happens to call its Employee Pension / PAYE / NSITF field.
function buildCalculatorMap(fields: PayrollTemplateField[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const field of fields) {
		if (field.valueSource !== 'SYSTEM_CALC') continue;
		const config = (field.formulaConfig || {}) as { calculator?: string };
		if (config.calculator) map.set(field.systemField, config.calculator);
	}
	return map;
}

// Locates which of a run's resolved fields represent "days in the month" and
// "days worked", using the same shared exact-key-then-heuristic lookups the
// live resolver's own proration step uses (field-resolver.ts), so both agree
// on the same field for the same run. The payslip PDF has a hardcoded
// attendance row for these two (see generateEnhancedPayslipPdf.ts) that the
// upload path already fills via an equivalent heuristic (pickBestAttendanceField
// in dynamic-processor.ts).
function detectAttendanceFields(entries: Array<[string, { displayName: string }]>): { daysInMonthField: string | null; daysWorkedField: string | null } {
	return {
		daysInMonthField: findDaysInMonthField(entries),
		daysWorkedField: findDaysWorkedField(entries),
	};
}

type CompanyInfo = {
	companyName: string | null;
	email: string | null;
	address: string | null;
	phone: string | null;
	logo: string | null;
	taxId: string | null;
	baseCurrency: string | null;
} | null;

export type FinalizeOneStaffRowParams = {
	row: PayrollData & { staff: StaffRecord };
	template: PayrollTemplate & { fields: PayrollTemplateField[] };
	company: CompanyInfo;
	companyId: string;
	monthName: string;
	year: number;
	periodMonth: number;
	approvedBy: string;
	sendEmails: boolean;
	// Staff Loans & Benefits linkage — the run's payPeriod ("August 2026")
	// and id, so any loan installment due this month gets marked PAID in the
	// same pass that finalizes this staff's payslip. Optional so callers
	// outside a full run approval (if any exist later) aren't forced to
	// thread these through.
	payPeriod?: string;
	payrollGenerationRunId?: string;
};

export type FinalizeOneStaffRowResult = {
	payslipId: string;
	payrollId: string;
	isUpdate: boolean;
	emailSent: boolean;
	emailError?: string;
};

/**
 * Turns ONE staff's reviewed PayrollData row into (or back into) their real
 * Payroll + Payslip record with a freshly rendered PDF. Safe to call
 * repeatedly for the same staff/period — see file header comment.
 */
export async function finalizeOneStaffRow(params: FinalizeOneStaffRowParams): Promise<FinalizeOneStaffRowResult> {
	const { row, template, company, companyId, monthName, year, periodMonth, approvedBy, sendEmails, payPeriod, payrollGenerationRunId } = params;
	const staffRecord = row.staff;
	const data = row.data as Record<string, { value: unknown; displayName: string; dataType: string; section: string; required: boolean; showOnPayslip: boolean }>;

	const customFields: Record<string, any> = {};
	Object.entries(data).forEach(([systemField, field]) => {
		customFields[systemField] = {
			value: field.value,
			displayName: field.displayName,
			dataType: field.dataType,
			section: field.section,
			required: field.required,
			showOnPayslip: field.showOnPayslip,
		};
	});

	const { daysInMonthField, daysWorkedField } = detectAttendanceFields(
		Object.entries(data).map(([systemField, field]) => [systemField, { displayName: field.displayName }])
	);
	const daysInMonth = daysInMonthField ? Number(data[daysInMonthField]?.value) || 0 : 0;
	const daysWorked = daysWorkedField ? Number(data[daysWorkedField]?.value) || 0 : 0;
	const reservedStaffDetailFields = new Set([
		...RESERVED_STAFF_DETAIL_FIELDS,
		...(daysInMonthField ? [daysInMonthField] : []),
		...(daysWorkedField ? [daysWorkedField] : []),
	]);

	const earningsForPayslip: Array<{ label: string; value: number; dataType: string; isCustom: boolean; section: string; type: 'earnings' }> = [];
	const deductionsForPayslip: Array<{ label: string; value: number; dataType: string; isCustom: boolean; section: string; type: 'deduction' }> = [];
	const additionalStaffDetails: Array<{ label: string; value: string }> = [];

	Object.entries(data).forEach(([systemField, field]) => {
		if (!field.showOnPayslip) return;
		const section = normalizeSection(field.section);
		const numericValue = field.dataType === 'Number' ? Number(field.value) || 0 : 0;
		if (section === 'FIXED_EARNINGS' || section === 'EARNINGS') {
			earningsForPayslip.push({ label: field.displayName, value: numericValue, dataType: field.dataType, isCustom: true, section, type: 'earnings' });
		} else if (section === 'DEDUCTIONS') {
			deductionsForPayslip.push({ label: field.displayName, value: numericValue, dataType: field.dataType, isCustom: true, section, type: 'deduction' });
		} else if (section === 'STAFF_DETAILS' && !reservedStaffDetailFields.has(systemField)) {
			additionalStaffDetails.push({ label: field.displayName, value: field.dataType === 'Number' ? String(numericValue) : String(field.value ?? '') });
		}
	});

	const totalEarnings = earningsForPayslip.reduce((sum, item) => sum + item.value, 0);
	const totalDeductions = deductionsForPayslip.reduce((sum, item) => sum + item.value, 0);
	const netPay = totalEarnings - totalDeductions;

	// Employer-cost fields (Employer Pension, NSITF, Medical Contribution) —
	// real costs to the company, never earnings, never deductions, never
	// touching the employee's own net pay. Collected independently of
	// showOnPayslip (unlike earnings/deductions above) since whether a figure
	// should appear on the employee's payslip is unrelated to whether it
	// should count toward the company's cost/invoice totals below.
	let totalEmployerCost = 0;
	Object.entries(data).forEach(([, field]) => {
		if (normalizeSection(field.section) !== 'EMPLOYER_COST') return;
		if (field.dataType !== 'Number') return;
		totalEmployerCost += Number(field.value) || 0;
	});

	// Structurally identify which resolved value is PAYE / Employee Pension /
	// Employer Pension / NSITF by the calculator that produced it (not by
	// guessing the company's own field naming) — see buildCalculatorMap.
	const calculatorBySystemField = buildCalculatorMap(template.fields);
	let payeAmount = 0;
	let employeePensionAmount = 0;
	let employerPensionAmount = 0;
	let nsitfAmount = 0;
	let itfAmount = 0;
	let nhfAmount = 0;
	let medicalContributionAmount = 0;
	for (const [systemField, field] of Object.entries(data)) {
		const calculator = calculatorBySystemField.get(systemField);
		const value = field.dataType === 'Number' ? Number(field.value) || 0 : 0;
		if (calculator === 'NIGERIA_PAYE_2025') payeAmount = value;
		else if (calculator === 'NIGERIA_PENSION_EMPLOYEE') employeePensionAmount = value;
		else if (calculator === 'NIGERIA_PENSION_EMPLOYER') employerPensionAmount = value;
		else if (calculator === 'NIGERIA_NSITF') nsitfAmount = value;
		else if (calculator === 'NIGERIA_ITF') itfAmount = value;
		else if (calculator === 'NIGERIA_NHF') nhfAmount = value;
		else if (normalizeSection(field.section) === 'EMPLOYER_COST' && /medical/i.test(`${systemField} ${field.displayName}`)) medicalContributionAmount = value;
	}

	// "Cost to company" for this staff member this period — the figure a
	// managed-payroll invoice marks its fee up from.
	const proratedSubTotal = round2(totalEarnings + totalEmployerCost);
	const invoicingEnabled = !!template.payrollInvoicingEnabled;
	const managementFeePercent = Number(template.payrollManagementFeePercent) || 0;
	const vatPercent = Number(template.payrollVatPercent) || 0;
	const managementFee = invoicingEnabled ? round2(proratedSubTotal * (managementFeePercent / 100)) : null;
	const vatOnManagementFee = invoicingEnabled && managementFee !== null ? round2(managementFee * (vatPercent / 100)) : null;
	const totalInvoiceValue = invoicingEnabled && managementFee !== null && vatOnManagementFee !== null ? round2(proratedSubTotal + managementFee + vatOnManagementFee) : null;

	// One final Payroll/Payslip per staff/period regardless of source — a
	// re-approve (or a post-approval edit/recompute/include) after further
	// changes updates in place rather than duplicating, same reasoning as the
	// upload path's overwriteExisting=true.
	const existingPayroll = await prisma.payroll.findFirst({
		where: { staffRecordId: staffRecord.id, month: monthName, year, companyId },
		orderBy: { createdAt: 'desc' },
	});

	const payrollData = {
		companyId,
		staffRecordId: staffRecord.id,
		month: monthName,
		year,
		status: 'PROCESSED',
		uploadedBy: approvedBy,
		templateType: 'DYNAMIC',
		templateId: template.id,
		source: 'GENERATED',
		customFields,
		grossPay: totalEarnings,
		deductions: totalDeductions,
		netSalary: netPay,
		payee: payeAmount,
		pensionDeduction: employeePensionAmount,
		employerPension: employerPensionAmount,
		nsitf: nsitfAmount,
		itf: itfAmount,
		nhf: nhfAmount,
		medicalContribution: medicalContributionAmount,
		proratedSubTotal,
		managementFee,
		vatOnManagementFee,
		totalInvoiceValue,
		pensionRsaPinSnapshot: staffRecord.rsaPin,
		pensionPfaCodeSnapshot: staffRecord.pfaCode,
		pensionEmployerCodeSnapshot: staffRecord.pensionEmployerCode,
		pensionSnapshotAt: new Date(),
	};

	const payrollRecord = existingPayroll
		? await prisma.payroll.update({ where: { id: existingPayroll.id }, data: { ...payrollData, updatedAt: new Date() } })
		: await prisma.payroll.create({ data: payrollData });

	// Staff Loans & Benefits linkage — mark any loan installment(s) due this
	// period as paid now that the payslip reflecting that deduction is being
	// finalized. Never blocks payslip finalization on failure.
	if (payPeriod && payrollGenerationRunId) {
		await markDueLoanRepaymentsPaid({
			companyId,
			staffId: staffRecord.id,
			payPeriod,
			payrollGenerationRunId,
			recordedBy: approvedBy,
		}).catch((e) => console.error('[PAYROLL_GENERATION] Failed to mark loan installments paid:', e));
	}

	const payslipInput: GeneratePayslipInput = {
		staff: {
			staffId: staffRecord.staffId,
			firstName: staffRecord.firstName,
			lastName: staffRecord.lastName,
			email: staffRecord.email,
			department: staffRecord.department || '',
			designation: staffRecord.position || '',
			position: staffRecord.position || '',
			companyName: template.payslipCompanyName || company?.companyName || '',
			companyAddress: company?.address || '',
			companyPhone: company?.phone || '',
			companyLogo: company?.logo || '',
			companyTaxId: company?.taxId || '',
			baseCurrency: company?.baseCurrency || 'NGN',
			// Preset-only tokens ({{bankName}} etc.) - ignored by the built-in
			// generator, consumed by the preset renderer when a preset is used.
			bankName: (staffRecord as any).bankName || '',
			accountNumber: (staffRecord as any).accountNumber || '',
			pfa: (staffRecord as any).taxProfile?.pfaName || '',
		},
		payroll: {
			rowNumber: 0,
			staffId: staffRecord.staffId,
			email: staffRecord.email,
			fullName: `${staffRecord.firstName} ${staffRecord.lastName}`,
			periodMonth,
			periodYear: year,
			basicSalary: 0,
			housingAllowance: 0,
			transportAllowance: 0,
			transportationAllowance: 0,
			otherAllowances: 0,
			grossPay: totalEarnings,
			payee: 0,
			pension: 0,
			netPay,
			daysInMonth,
			daysWorked,
			rawRow: {},
			bonusKPI: 0,
			deductions: totalDeductions,
			overtimeIncome: 0,
			communicationAllowance: 0,
			outstandingIncome: 0,
			dressingAllowance: 0,
			leaveAllowance: 0,
			entertainmentAllowance: 0,
			utilityAllowance: 0,
			walletPayment: 0,
			commercialPayment: 0,
			proratedGrossPay: 0,
		},
		companyInfo: company
			? {
					name: template.payslipCompanyName || company.companyName || '',
					address: company.address || '',
					phone: company.phone || '',
					email: company.email || '',
					logo: company.logo || '',
					taxId: company.taxId || '',
					baseCurrency: company.baseCurrency || 'NGN',
			  }
			: undefined,
		earnings: earningsForPayslip,
		deductions: deductionsForPayslip,
		summary: { grossPay: totalEarnings, totalDeductions, netPay },
		templateName: template.templateName,
		additionalStaffDetails,
		showPaymentDetails: false,
	};

	// Company Payslip Preset dispatch: if the template has an active preset
	// selected, its HTML layout renders the PDF instead of the built-in one.
	const presetHtml = await getActivePresetHtml((template as any).payslipPresetId);
	const pdfResult = await (presetHtml
		? generatePayslipPdfUnified({ ...payslipInput, payslipPresetHtml: presetHtml })
		: generateEnhancedPayslipPdf(payslipInput));
	const fileDataForPrisma = Buffer.from(await watermarkPdfIfTrial(staffRecord.companyId, pdfResult.pdfBuffer));

	const payslipData = {
		fileName: pdfResult.fileName,
		fileData: fileDataForPrisma,
		fileType: 'application/pdf',
		fileSize: fileDataForPrisma.length,
		grossPay: totalEarnings,
		netPay,
		filePath: `/database/payslips/${staffRecord.staffId}/${year}/${monthName}/${pdfResult.fileName}`,
		draft: !sendEmails,
	};

	const existingPayslip = await prisma.payslip.findFirst({
		where: { staffRecordId: staffRecord.id, month: monthName, year, companyId },
		orderBy: { createdAt: 'desc' },
	});

	let payslipId: string;
	const isUpdate = Boolean(existingPayslip);
	if (existingPayslip) {
		await prisma.payslip.update({ where: { id: existingPayslip.id }, data: { ...payslipData, updatedBy: approvedBy, updatedAt: new Date() } });
		payslipId = existingPayslip.id;
	} else {
		const created = await prisma.payslip.create({
			data: {
				...payslipData,
				payrollId: payrollRecord.id,
				staffRecordId: staffRecord.id,
				companyId,
				month: monthName,
				year,
				createdBy: approvedBy,
				updatedBy: approvedBy,
			},
		});
		payslipId = created.id;
	}

	let emailSent = false;
	let emailError: string | undefined;
	if (sendEmails) {
		try {
			const emailResult = await sendPayrollNotificationEmail(
				{
					id: staffRecord.id,
					companyId: staffRecord.companyId,
					firstName: staffRecord.firstName,
					lastName: staffRecord.lastName,
					email: staffRecord.email,
					staffId: staffRecord.staffId,
					department: staffRecord.department || null,
					position: staffRecord.position || null,
					isRegistered: staffRecord.isRegistered,
				},
				{
					id: payslipId,
					month: monthName,
					year,
					netSalary: netPay,
					isUpdate,
				}
			);
			if (emailResult.success) emailSent = true;
			else emailError = emailResult.error || 'Email sending failed';
		} catch (err: any) {
			emailError = err.message || 'Email sending failed';
		}
	}

	await createNotification(
		staffRecord.id,
		'PAYSLIP_GENERATED',
		`Payslip Generated (${monthName} ${year})`,
		`Your payslip for ${monthName} ${year} has been generated and is now available in your account.`,
		{ source: 'PAYROLL_GENERATION', month: monthName, year, payslipId, payrollId: payrollRecord.id, companyName: company?.companyName || null },
		companyId
	);

	await prisma.payrollData.update({
		where: { id: row.id },
		data: { status: 'APPROVED', approvedBy, approvedAt: new Date(), payrollId: payrollRecord.id },
	});

	return { payslipId, payrollId: payrollRecord.id, isUpdate, emailSent, emailError };
}

export type ApproveGenerationRunParams = {
	runId: string;
	approvedBy: string;
	sendEmails: boolean;
};

export type ApproveGenerationRunResult = {
	approved: number;
	emailsSent: number;
	emailFailures: Array<{ staffId: string; error: string }>;
	retracted: number;
};

/**
 * Derives {monthName, year, periodMonth} from a run's payPeriod string
 * (e.g. "August 2026") — shared by approveGenerationRun and any caller that
 * re-invokes finalizeOneStaffRow outside a full approve (row edit,
 * recompute, include).
 */
export function derivePeriodParts(payPeriod: string): { monthName: string; year: number; periodMonth: number } {
	const monthName = payPeriod.replace(/\s+\d{4}$/, '');
	const year = Number(payPeriod.match(/\d{4}$/)?.[0]) || new Date().getFullYear();
	const periodMonth = monthNameToNumber(monthName) || new Date().getMonth() + 1;
	return { monthName, year, periodMonth };
}

/**
 * Validates that a single PayrollData row has no blank required field.
 * Exported so a post-approval single-row edit can validate just that row,
 * rather than re-checking every other staff in the run (already validated
 * at the original approval).
 */
export function findMissingRequiredFields(row: PayrollData & { staff: StaffRecord }): string[] {
	const data = row.data as Record<string, { value: unknown; required: boolean; displayName: string }>;
	const missing: string[] = [];
	for (const field of Object.values(data)) {
		if (field.required && (field.value === null || field.value === undefined || field.value === '')) {
			missing.push(`${row.staff.firstName} ${row.staff.lastName} (${row.staff.staffId}): ${field.displayName}`);
		}
	}
	return missing;
}

export async function approveGenerationRun(params: ApproveGenerationRunParams): Promise<ApproveGenerationRunResult> {
	const { runId, approvedBy, sendEmails } = params;

	const run = await prisma.payrollGenerationRun.findUnique({ where: { id: runId } });
	if (!run) throw new Error('Generation run not found');
	if (run.status === 'APPROVED') throw new Error('This run has already been approved');

	const template = await prisma.payrollTemplate.findUnique({ where: { id: run.templateId }, include: { fields: true } });
	if (!template) throw new Error('Payroll template not found');

	const company = await prisma.company.findUnique({
		where: { id: run.companyId },
		select: {
			companyName: true,
			email: true,
			address: true,
			phone: true,
			logo: true,
			taxId: true,
			baseCurrency: true,
		},
	});

	const rows = await prisma.payrollData.findMany({
		where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod, status: 'GENERATED' },
		include: { staff: true },
	});

	// Approval is all-or-nothing: if any row is still missing a required
	// value, reject the whole approve so HR goes back to review rather than
	// risk a partially-broken payroll going out.
	const stillIncomplete = rows.flatMap((row) => findMissingRequiredFields(row));
	if (stillIncomplete.length > 0) {
		throw new Error(`Cannot approve — ${stillIncomplete.length} required field(s) still missing:\n${stillIncomplete.slice(0, 20).join('\n')}`);
	}

	const { monthName, year, periodMonth } = derivePeriodParts(run.payPeriod);

	// A staff member excluded since the last approval (via Exclude, while the
	// run was reopened for editing) may already have a real Payroll/Payslip
	// from that earlier approval — this is the one deliberate point where
	// that gets retracted, not when Exclude itself was clicked. No-op on a
	// first-time approval (nothing exists yet for anyone in excludedStaffIds).
	// source: 'GENERATED' is a defense-in-depth guard — never delete a
	// Payroll row the manual upload path created.
	let retracted = 0;
	if (run.excludedStaffIds.length > 0) {
		const deleted = await prisma.payroll.deleteMany({
			where: { staffRecordId: { in: run.excludedStaffIds }, month: monthName, year, companyId: run.companyId, source: 'GENERATED' },
		});
		retracted = deleted.count;
	}

	let approvedCount = 0;
	let emailsSent = 0;
	const emailFailures: Array<{ staffId: string; error: string }> = [];

	for (const row of rows) {
		const result = await finalizeOneStaffRow({
			row,
			template,
			company,
			companyId: run.companyId,
			monthName,
			year,
			periodMonth,
			approvedBy,
			sendEmails,
			payPeriod: run.payPeriod,
			payrollGenerationRunId: run.id,
		});
		if (result.emailSent) emailsSent += 1;
		if (result.emailError) emailFailures.push({ staffId: row.staff.staffId, error: result.emailError });
		approvedCount += 1;
	}

	await prisma.payrollGenerationRun.update({
		where: { id: runId },
		data: { status: 'APPROVED', approvedBy, approvedAt: new Date() },
	});

	return { approved: approvedCount, emailsSent, emailFailures, retracted };
}

/**
 * Run approval outside the request lifecycle so large payslip batches do not
 * exceed browser, proxy, or serverless request timeouts.
 */
export async function processPayrollApprovalInBackground(params: ApproveGenerationRunParams): Promise<void> {
	try {
		await approveGenerationRun(params);
	} catch (error) {
		console.error('[PAYROLL_GENERATION] Background approval error:', { runId: params.runId, error });
		await prisma.payrollGenerationRun
			.update({ where: { id: params.runId }, data: { status: 'GENERATED' } })
			.catch((updateError) => console.error('[PAYROLL_GENERATION] Failed to restore generated status:', { runId: params.runId, updateError }));
	}
}
