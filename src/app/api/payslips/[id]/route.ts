import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils';
import { regeneratePayslipPdf } from '@/app/lib/payroll/buildPayslipPdfInput';

type RouteParams = {
	params: {
		id: string;
	};
};

// Editable Payroll columns for ISURF_STANDARD/BLUERIDGE payslips — every
// fixed Decimal figure a payslip can show, labelled for the edit drawer and
// grouped for display. DYNAMIC payslips instead expose whatever's inside
// Payroll.customFields (already self-describing — see GET below). GET only
// returns whichever of these are actually non-null on a given record, and
// PATCH only accepts keys from this same map — never an arbitrary field.
const EDITABLE_PAYROLL_FIELDS: Record<string, { label: string; section: 'EARNINGS' | 'DEDUCTIONS' | 'OTHER' }> = {
	basicSalary: { label: 'Basic Salary', section: 'EARNINGS' },
	housing: { label: 'Housing Allowance', section: 'EARNINGS' },
	transport: { label: 'Transport Allowance', section: 'EARNINGS' },
	dressing: { label: 'Dressing Allowance', section: 'EARNINGS' },
	leaveAllowance: { label: 'Leave Allowance', section: 'EARNINGS' },
	entertainment: { label: 'Entertainment Allowance', section: 'EARNINGS' },
	utility: { label: 'Utility Allowance', section: 'EARNINGS' },
	otherAllowance: { label: 'Other Allowance', section: 'EARNINGS' },
	transportationAllowance: { label: 'Transportation Allowance', section: 'EARNINGS' },
	overtimeIncome: { label: 'Overtime Income', section: 'EARNINGS' },
	communicationAllowance: { label: 'Communication Allowance', section: 'EARNINGS' },
	outstandingIncome: { label: 'Outstanding Income', section: 'EARNINGS' },
	bonusKPI: { label: 'Bonus / KPI', section: 'EARNINGS' },
	proratedGrossPay: { label: 'Prorated Gross Pay', section: 'EARNINGS' },
	walletPayment: { label: 'Pay OPay', section: 'OTHER' },
	commercialPayment: { label: 'Bank Payment', section: 'OTHER' },
	payee: { label: 'PAYE Tax', section: 'DEDUCTIONS' },
	pensionDeduction: { label: 'Pension', section: 'DEDUCTIONS' },
	deductions: { label: 'Other Deductions', section: 'DEDUCTIONS' },
	employerPension: { label: 'Employer Pension', section: 'DEDUCTIONS' },
	nsitf: { label: 'NSITF', section: 'DEDUCTIONS' },
	medicalContribution: { label: 'Medical Contribution', section: 'DEDUCTIONS' },
	managementFee: { label: 'Management Fee', section: 'OTHER' },
	vatOnManagementFee: { label: 'VAT on Management Fee', section: 'OTHER' },
	totalInvoiceValue: { label: 'Total Invoice Value', section: 'OTHER' },
	consolidatedRelief: { label: 'Consolidated Relief', section: 'OTHER' },
	taxableIncome: { label: 'Taxable Income', section: 'OTHER' },
	annualPension: { label: 'Annual Pension', section: 'OTHER' },
	annualGrossPay: { label: 'Annual Gross Pay', section: 'OTHER' },
	proratedGrossWithExtra: { label: 'Prorated Gross (with Extra)', section: 'OTHER' },
	proratedSubTotal: { label: 'Prorated Sub Total', section: 'OTHER' },
	// Gross Pay and Net Salary are always shown (see GET), independent of
	// being null-filtered like the rest, since they're the two figures HR is
	// most likely to be correcting.
	grossPay: { label: 'Gross Pay', section: 'OTHER' },
	netSalary: { label: 'Net Salary', section: 'OTHER' }
};

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}
		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

		const { id } = params;
		const payslip = await prisma.payslip.findUnique({
			where: { id },
			include: {
				staffRecord: { select: { staffId: true, firstName: true, lastName: true, department: true } },
				payroll: { select: { templateType: true, customFields: true, templateId: true, source: true, template: { select: { templateName: true, payslipCompanyName: true } } } }
			}
		});
		if (!payslip) {
			return withCors(ApiResponse.error('Payslip not found', 404), origin);
		}

		const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL';
		const hasAccess = await validatePayrollCompanyAccess(user, payslip.companyId, userRole);
		if (!hasAccess) {
			return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin);
		}

		const templateType = payslip.payroll.templateType || 'ISURF_STANDARD';
		let fields: Array<{ systemField: string; displayName: string; section: string; value: number | string }> = [];

		if (templateType === 'DYNAMIC') {
			const customFields = (payslip.payroll.customFields as Record<string, { value: unknown; displayName: string; dataType: string; section: string }> | null) || {};
			fields = Object.entries(customFields)
				.filter(([, f]) => f.dataType === 'Number')
				.map(([systemField, f]) => ({
					systemField,
					displayName: f.displayName,
					section: (f.section || 'OTHER').toUpperCase().includes('DEDUCTION') ? 'DEDUCTIONS' : 'EARNINGS',
					value: Number(f.value) || 0
				}));
		} else {
			const payrollRecord = payslip.payroll as unknown as Record<string, unknown>;
			fields = Object.entries(EDITABLE_PAYROLL_FIELDS)
				.filter(([column]) => payrollRecord[column] !== null && payrollRecord[column] !== undefined)
				.map(([column, meta]) => ({
					systemField: column,
					displayName: meta.label,
					section: meta.section,
					value: Number(payrollRecord[column]) || 0
				}));
		}

		return withCors(
			ApiResponse.success(
				{
					id: payslip.id,
					staff: {
						staffId: payslip.staffRecord.staffId,
						name: `${payslip.staffRecord.firstName} ${payslip.staffRecord.lastName}`,
						department: payslip.staffRecord.department || ''
					},
					month: payslip.month,
					year: payslip.year,
					templateType,
					source: payslip.payroll.source,
					// Payroll-Generation-sourced payslips are edited from their
					// generation run's review page instead (see PATCH below) — it
					// keeps PayrollData and the real record in sync; this generic
					// editor writes straight to Payroll and would desync them.
					editable: payslip.payroll.source !== 'GENERATED',
					templateName: payslip.payroll.template?.templateName || null,
					draft: payslip.draft,
					createdAt: payslip.createdAt,
					updatedAt: payslip.updatedAt,
					grossPay: payslip.grossPay,
					netPay: payslip.netPay,
					fields
				},
				'Payslip detail retrieved'
			),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}
		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

		const { id } = params;
		const body = await request.json();
		const values = body?.values;
		if (!values || typeof values !== 'object' || Array.isArray(values)) {
			return withCors(ApiResponse.error('values object is required', 400), origin);
		}

		const payslip = await prisma.payslip.findUnique({
			where: { id },
			include: {
				staffRecord: { select: { staffId: true, firstName: true, lastName: true, email: true, department: true, position: true, bankName: true, accountNumber: true, taxProfile: { select: { pfaName: true } } } },
				payroll: { include: { template: { select: { templateName: true, payslipCompanyName: true, payslipPresetId: true } } } },
				company: { select: { companyName: true, address: true, phone: true, logo: true, taxId: true } }
			}
		});
		if (!payslip) {
			return withCors(ApiResponse.error('Payslip not found', 404), origin);
		}
		if (payslip.payroll.source === 'GENERATED') {
			return withCors(
				ApiResponse.error('This payslip was created by Payroll Generation — edit it from the generation run\'s review page instead.', 409),
				origin
			);
		}

		const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL';
		const hasAccess = await validatePayrollCompanyAccess(user, payslip.companyId, userRole);
		if (!hasAccess) {
			return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin);
		}

		const templateType = payslip.payroll.templateType || 'ISURF_STANDARD';

		// Applied exactly as given, no cascading recompute — faithful to how
		// this pipeline has always treated every field as an independently
		// trusted value, even the very first time a spreadsheet is uploaded.
		let payrollUpdateData: Record<string, unknown> = {};

		if (templateType === 'DYNAMIC') {
			const customFields = { ...((payslip.payroll.customFields as Record<string, any> | null) || {}) };
			for (const [systemField, raw] of Object.entries(values)) {
				const existing = customFields[systemField];
				if (!existing || existing.dataType !== 'Number') continue; // ignore keys that aren't editable numeric custom fields
				const num = Number(raw);
				if (!Number.isFinite(num)) {
					return withCors(ApiResponse.error(`"${existing.displayName}" must be a number`, 400), origin);
				}
				customFields[systemField] = { ...existing, value: num };
			}
			payrollUpdateData = { customFields };
		} else {
			for (const [column, raw] of Object.entries(values)) {
				const meta = EDITABLE_PAYROLL_FIELDS[column];
				if (!meta) continue; // ignore keys outside the whitelist
				const num = Number(raw);
				if (!Number.isFinite(num)) {
					return withCors(ApiResponse.error(`"${meta.label}" must be a number`, 400), origin);
				}
				payrollUpdateData[column] = num;
			}
		}

		if (Object.keys(payrollUpdateData).length === 0) {
			return withCors(ApiResponse.error('No editable fields were provided', 400), origin);
		}

		const updatedPayroll = await prisma.payroll.update({
			where: { id: payslip.payrollId },
			data: { ...payrollUpdateData, updatedAt: new Date() }
		});

		const { pdfBuffer, fileName, grossPay, netPay } = await regeneratePayslipPdf({
			payroll: updatedPayroll,
			staffRecord: payslip.staffRecord,
			company: payslip.company,
			templateName: payslip.payroll.template?.templateName,
			payslipCompanyName: payslip.payroll.template?.payslipCompanyName || undefined,
			payslipPresetId: payslip.payroll.template?.payslipPresetId,
			staffBankName: payslip.staffRecord.bankName || undefined,
			staffAccountNumber: payslip.staffRecord.accountNumber || undefined,
			staffPfa: payslip.staffRecord.taxProfile?.pfaName || undefined
		});

		const updatedPayslip = await prisma.payslip.update({
			where: { id: payslip.id },
			data: {
				fileData: Buffer.from(pdfBuffer),
				fileName,
				fileType: 'application/pdf',
				fileSize: pdfBuffer.length,
				grossPay,
				netPay,
				updatedBy: user.userId,
				updatedAt: new Date()
			}
		});

		return withCors(
			ApiResponse.success(
				{ id: updatedPayslip.id, grossPay: updatedPayslip.grossPay, netPay: updatedPayslip.netPay, updatedAt: updatedPayslip.updatedAt },
				'Payslip updated'
			),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const user = requireRole(token, ['ADMIN', 'HR', 'SUPER_ADMIN']);

		const { id } = params;
		if (!id) {
			return withCors(ApiResponse.error('Payslip id is required', 400), origin);
		}

		const existingPayslip = await prisma.payslip.findUnique({
			where: { id },
			select: { id: true },
		});

		if (!existingPayslip) {
			return withCors(ApiResponse.error('Payslip not found', 404), origin);
		}

		await prisma.payslip.delete({
			where: { id },
		});

		return withCors(
			ApiResponse.success(
				{
					deleted: true,
					id,
					deletedBy: user.userId,
				},
				'Payslip deleted successfully'
			),
			origin
		);
	} catch (error) {
		console.error('[PAYSILP_DELETE] Error deleting payslip:', error);
		return withCors(handleApiError(error), origin);
	}
}
