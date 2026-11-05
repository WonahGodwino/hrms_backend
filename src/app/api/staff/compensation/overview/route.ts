// src/app/api/staff/compensation/overview/route.ts
//
// Table view of every active staff member's Compensation Profile at once —
// the "preview" so HR can see the full picture before generating payroll,
// instead of only being able to check one staff at a time. Read-only; edits
// happen via PATCH /api/staff/:id/compensation (reused by the per-row edit
// drawer on the frontend) or the bulk upload endpoint. Part of the new
// Payroll Generation sub-module.
import { NextRequest } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import {
    DAYS_WORKED_DISPLAY_NAME, DAYS_WORKED_SYSTEM_FIELD, GROSS_SYSTEM_FIELD,
    PERIOD_DERIVED_SYSTEM_FIELDS, STAFF_RECORD_DERIVED_SYSTEM_FIELDS
} from '@/app/lib/payroll/generation/field-resolver';
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

type CompensationFieldLike = { systemField: string; displayName: string; dataType: string; section: string; required: boolean };

// Gross is a standalone, directly-entered figure (not a computed sum) —
// always offered here regardless of whether the current template declares
// a matching field, so it can be used as a PERCENTAGE base in any template.
const GROSS_FIELD: CompensationFieldLike = {
	systemField: GROSS_SYSTEM_FIELD,
	displayName: 'Gross',
	dataType: 'Number',
	section: 'FIXED_VALUES',
	required: false,
};

// Fixed the same way Gross is — always offered regardless of template
// config, so attendance proration always has a place to read from instead
// of depending on a template happening to declare a correctly-named field.
const DAYS_WORKED_FIELD: CompensationFieldLike = {
	systemField: DAYS_WORKED_SYSTEM_FIELD,
	displayName: DAYS_WORKED_DISPLAY_NAME,
	dataType: 'Days',
	section: 'ATTENDANCE',
	required: false,
};

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
		const companyId = searchParams.get('companyId');
		const templateId = searchParams.get('templateId');

		if (!companyId) {
			return withCors(ApiResponse.error('Company selection is required', 400), origin);
		}
		if (!templateId) {
			return withCors(ApiResponse.error('Template selection is required', 400), origin);
		}

		const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL';
		const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole);
		if (!hasAccess) {
			return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin);
		}

		const template = await prisma.payrollTemplate.findFirst({
			where: { id: templateId, companyId },
			include: { fields: { orderBy: { order: 'asc' } } },
		});
		if (!template) {
			return withCors(ApiResponse.error('Payroll template not found for this company', 404), origin);
		}

		const templateFields: CompensationFieldLike[] = template.fields.filter(
			(f) =>
				(f.valueSource === 'FIXED_PROFILE' || f.valueSource === 'MANUAL') &&
				!STAFF_RECORD_DERIVED_SYSTEM_FIELDS.includes(f.systemField) &&
				!PERIOD_DERIVED_SYSTEM_FIELDS.includes(f.systemField)
		);
		const profileFields: CompensationFieldLike[] = [GROSS_FIELD, DAYS_WORKED_FIELD, ...templateFields];

		const staff = await prisma.staffRecord.findMany({
			where: { companyId, isActive: true },
			select: {
				id: true,
				staffId: true,
				firstName: true,
				lastName: true,
				email: true,
				department: true,
				payrollProfile: { select: { values: true, updatedBy: true, updatedAt: true } },
			},
			orderBy: [{ department: 'asc' }, { firstName: 'asc' }],
		});

		const rows = staff.map((s) => {
			const rawValues = (s.payrollProfile?.values as Record<string, unknown> | undefined) || {};
			const values: Record<string, number | string | null> = {};

			profileFields.forEach((f) => {
				const raw = rawValues[f.systemField];
				const isEmpty = raw === undefined || raw === null || raw === '';
				values[f.systemField] = isEmpty ? null : f.dataType === 'Number' ? Number(raw) : String(raw);
			});

			return {
				staffRecordId: s.id,
				staffId: s.staffId,
				staffName: `${s.firstName} ${s.lastName}`,
				email: s.email || '',
				department: s.department || '',
				values,
				updatedBy: s.payrollProfile?.updatedBy || null,
				updatedAt: s.payrollProfile?.updatedAt || null,
			};
		});

		return withCors(
			ApiResponse.success(
				{
					templateId: template.id,
					templateName: template.templateName,
					fields: profileFields.map((f) => ({
						systemField: f.systemField,
						displayName: f.displayName,
						dataType: f.dataType,
						section: f.section,
						required: f.required,
					})),
					rows,
				},
				'Compensation overview retrieved'
			),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
