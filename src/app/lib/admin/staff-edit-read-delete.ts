// Moved out of app/api/admin/staff/edit/[id]/route.ts (CODE-004: keep route files small).
import { forCompany } from '@/app/lib/data/tenant'
import { NextRequest } from 'next/server'
import { withCors } from '@/app/lib/cors'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { requireRole } from '@/app/lib/auth'
import { sanitizeString } from '@/app/lib/admin/route-helpers'
import validator from 'validator'
import { prisma } from '@/app/lib/db'
import { MANUAL_PENSION_CAPTURE_SYSTEM_FIELDS } from '@/app/lib/staff/pension-fields'
import { cleanStaffText } from '@/app/lib/staff/placeholder-values'

export type RouteParams = {
	params: Promise<{
		id: string;
	}>;
};

export async function checkStaffAccess(currentUser: { role: string; userId: string }, staffCompanyId: string): Promise<boolean> {
	if (currentUser.role === 'SUPER_ADMIN') {
		return true;
	}

	// For HR/ADMIN, check if they have access to the staff's company
	const userAssignments = await forCompany(staffCompanyId).userCompany.findMany({
		where: {
			userId: currentUser.userId
		},
	});

	return userAssignments.length > 0;
}

export async function getStaffForEdit(request: NextRequest, props: RouteParams) {
    const params = await props.params;
    const origin = request.headers.get('origin');

    try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const currentUser = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']);

		const { id } = params;

		// Sanitize ID parameter
		const sanitizedId = sanitizeString(id);
		if (!sanitizedId || !validator.isLength(sanitizedId, { min: 1, max: 100 })) {
			return withCors(ApiResponse.error('Invalid staff ID', 400), origin);
		}

		// Fetch staff record with company info
		const staffRecord = await prisma.staffRecord.findUnique({
			where: { id: sanitizedId },
			select: {
				id: true,
				staffId: true,
				email: true,
				firstName: true,
				lastName: true,
				department: true,
				position: true,
				designationId: true,
				designation: { select: { id: true, title: true } },
				departmentId: true,
				departments: { select: { id: true, name: true } },
				phone: true,
				bankName: true,
				accountNumber: true,
				bvn: true,
				rsaPin: true,
				pfaCode: true,
				pensionContributionType: true,
				pensionEmployerCode: true,
				voluntaryPensionEmployee: true,
				voluntaryPensionEmployer: true,
				otherPensionContribution: true,
				isRegistered: true,
				role: true,
				isActive: true,
				hireDate: true,
				middleName: true,
				gender: true,
				dateOfBirth: true,
				maritalStatus: true,
				stateOfOrigin: true,
				lgaOfOrigin: true,
				townOfOrigin: true,
				alternatePhone: true,
				nin: true,
				stateOfIssuance: true,
				residentialAddress: true,
				numberOfPrimaryDependants: true,
				isBlocked: true,
				blockReason: true,
				encodedId: true,
				companyId: true,
				managerId: true,
				manager: { select: { id: true, firstName: true, lastName: true } },
				company: {
					select: {
						id: true,
						companyName: true,
						email: true,
						baseCurrency: true,
					},
				},
				createdAt: true,
				updatedAt: true,
				createdBy: true,
			},
		});

		if (!staffRecord) {
			return withCors(ApiResponse.error('Staff record not found', 404), origin);
		}

		// Check if current user has access to this staff's company
		if (currentUser.role !== 'SUPER_ADMIN') {
			const hasAccess = await checkStaffAccess(currentUser, staffRecord.companyId);
			if (!hasAccess) {
				return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin);
			}
		}

		// Pension capture fields (contribution type, voluntary EE/ER, other
		// contribution) are now set at payroll generation/upload time, not in
		// Staff Management — this profile view shows whatever the most recent
		// payroll run captured, read straight off that Payroll row's
		// customFields rather than StaffRecord (see pension-fields.ts's
		// MANUAL_PENSION_CAPTURE_FIELDS for why the key names are fixed).
		const latestPayroll = await prisma.payroll.findFirst({
			where: { staffRecordId: staffRecord.id },
			orderBy: [{ year: 'desc' }, { month: 'desc' }],
			select: { month: true, year: true, customFields: true },
		});
		const latestPayrollFields = (latestPayroll?.customFields as Record<string, { value?: unknown }> | null) || null;
		const hasAnyPensionCapture = latestPayrollFields
			? MANUAL_PENSION_CAPTURE_SYSTEM_FIELDS.some((key) => latestPayrollFields[key]?.value !== undefined && latestPayrollFields[key]?.value !== null && latestPayrollFields[key]?.value !== '')
			: false;
		const pensionManual = hasAnyPensionCapture
			? {
					contributionType: (latestPayrollFields!.pensionContributionType?.value as string) || null,
					voluntaryPensionEmployee: latestPayrollFields!.voluntaryPensionEmployee?.value != null ? Number(latestPayrollFields!.voluntaryPensionEmployee.value) : null,
					voluntaryPensionEmployer: latestPayrollFields!.voluntaryPensionEmployer?.value != null ? Number(latestPayrollFields!.voluntaryPensionEmployer.value) : null,
					otherPensionContribution: latestPayrollFields!.otherPensionContribution?.value != null ? Number(latestPayrollFields!.otherPensionContribution.value) : null,
					asOfMonth: latestPayroll!.month,
					asOfYear: latestPayroll!.year,
				}
			: null;

		// createdBy stores the creating user's StaffRecord id (no FK/relation
		// declared on it), so resolve it to a display name the same way
		// getUserDisplayName does for the authenticated user - falls back to the
		// raw value if it doesn't resolve to a known staff record (e.g. a
		// non-staff actor string from a system/seed process).
		let createdByName: string | null = null;
		if (staffRecord.createdBy) {
			const creator = await prisma.staffRecord.findUnique({
				where: { id: staffRecord.createdBy },
				select: { firstName: true, lastName: true, email: true },
			});
			const fullName = creator ? `${creator.firstName || ''} ${creator.lastName || ''}`.trim() : '';
			createdByName = fullName || creator?.email || staffRecord.createdBy;
		}

		// Escape output data to prevent XSS in API responses
		const sanitizedResponse = {
			...staffRecord,
			firstName: validator.escape(staffRecord.firstName),
			lastName: validator.escape(staffRecord.lastName),
			email: validator.escape(staffRecord.email),
			// Prefer the linked Department; ignore filler values ("0", "-", ...)
			// older imports stored for blank cells.
			department: (() => {
				const d = cleanStaffText(staffRecord.departments?.name) ?? cleanStaffText(staffRecord.department);
				return d ? validator.escape(d) : null;
			})(),
			position: validator.escape(staffRecord.position),
			phone: cleanStaffText(staffRecord.phone) ? validator.escape(staffRecord.phone!.trim()) : null,
			bankName: staffRecord.bankName ? validator.escape(staffRecord.bankName) : null,
			accountNumber: staffRecord.accountNumber ? validator.escape(staffRecord.accountNumber) : null,
			bvn: staffRecord.bvn ? '***' + staffRecord.bvn.slice(-4) : null, // Mask BVN for security
			rsaPin: staffRecord.rsaPin ? validator.escape(staffRecord.rsaPin) : null,
			pfaCode: staffRecord.pfaCode ? validator.escape(staffRecord.pfaCode) : null,
			pensionContributionType: staffRecord.pensionContributionType || null,
			pensionEmployerCode: staffRecord.pensionEmployerCode ? validator.escape(staffRecord.pensionEmployerCode) : null,
			voluntaryPensionEmployee: staffRecord.voluntaryPensionEmployee !== null ? Number(staffRecord.voluntaryPensionEmployee) : null,
			voluntaryPensionEmployer: staffRecord.voluntaryPensionEmployer !== null ? Number(staffRecord.voluntaryPensionEmployer) : null,
			otherPensionContribution: staffRecord.otherPensionContribution !== null ? Number(staffRecord.otherPensionContribution) : null,
			pensionManual,
			middleName: staffRecord.middleName ? validator.escape(staffRecord.middleName) : null,
			gender: staffRecord.gender || null,
			dateOfBirth: staffRecord.dateOfBirth,
			maritalStatus: staffRecord.maritalStatus || null,
			stateOfOrigin: staffRecord.stateOfOrigin || null,
			lgaOfOrigin: staffRecord.lgaOfOrigin ? validator.escape(staffRecord.lgaOfOrigin) : null,
			townOfOrigin: staffRecord.townOfOrigin ? validator.escape(staffRecord.townOfOrigin) : null,
			alternatePhone: cleanStaffText(staffRecord.alternatePhone) ? validator.escape(staffRecord.alternatePhone!.trim()) : null,
			nin: staffRecord.nin ? validator.escape(staffRecord.nin) : null,
			stateOfIssuance: staffRecord.stateOfIssuance || null,
			residentialAddress: staffRecord.residentialAddress ? validator.escape(staffRecord.residentialAddress) : null,
			numberOfPrimaryDependants: staffRecord.numberOfPrimaryDependants,
			encodedId: staffRecord.encodedId ? validator.escape(staffRecord.encodedId) : null,
			company: staffRecord.company
				? {
						...staffRecord.company,
						companyName: validator.escape(staffRecord.company.companyName),
						email: validator.escape(staffRecord.company.email),
				  }
				: null,
			createdBy: staffRecord.createdBy ? validator.escape(staffRecord.createdBy) : null,
			createdByName: createdByName ? validator.escape(createdByName) : null,
		};

		return withCors(ApiResponse.success(sanitizedResponse, 'Staff record retrieved successfully'), origin);
	} catch (error) {
		const message = formatError(error);
		console.error('Error fetching staff record:', error);
		return withCors(ApiResponse.error(message, 500), origin);
	}
}

export async function deleteStaffFromEdit(request: NextRequest, props: RouteParams) {
    const params = await props.params;
    const origin = request.headers.get('origin');

    try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const currentUser = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']);

		const { id } = params;

		// Sanitize ID parameter
		const sanitizedId = sanitizeString(id);
		if (!sanitizedId || !validator.isLength(sanitizedId, { min: 1, max: 100 })) {
			return withCors(ApiResponse.error('Invalid staff ID', 400), origin);
		}

		// Check if staff record exists
		const existingStaff = await prisma.staffRecord.findUnique({
			where: { id: sanitizedId },
			select: {
				id: true,
				companyId: true,
				staffId: true,
				email: true,
				role: true,
			},
		});

		if (!existingStaff) {
			return withCors(ApiResponse.error('Staff record not found', 404), origin);
		}

		// Check if current user has access to this staff's company
		if (currentUser.role !== 'SUPER_ADMIN') {
			const hasAccess = await checkStaffAccess(currentUser, existingStaff.companyId);
			if (!hasAccess) {
				return withCors(ApiResponse.error('You do not have access to deactivate this staff record', 403), origin);
			}
		}

		// Prevent deactivating own account
		if (existingStaff.id === currentUser.userId) {
			return withCors(ApiResponse.error('You cannot deactivate your own account', 400), origin);
		}

		// Soft delete by setting isActive to false
		const deactivatedStaff = await prisma.staffRecord.update({
			where: { id: sanitizedId },
			data: {
				isActive: false,
				updatedBy: currentUser.email || currentUser.userId,
				updatedAt: new Date(),
			},
			select: {
				id: true,
				staffId: true,
				email: true,
				firstName: true,
				lastName: true,
				isActive: true,
				updatedAt: true,
				updatedBy: true,
			},
		});

		// Log the deactivation
		console.log(`Staff record ${sanitizedId} deactivated by ${currentUser.role} (${currentUser.email})`);

		// Sanitize response
		const sanitizedResponse = {
			...deactivatedStaff,
			firstName: validator.escape(deactivatedStaff.firstName),
			lastName: validator.escape(deactivatedStaff.lastName),
			email: validator.escape(deactivatedStaff.email),
			updatedBy: deactivatedStaff.updatedBy ? validator.escape(deactivatedStaff.updatedBy) : null,
		};

		return withCors(ApiResponse.success(sanitizedResponse, 'Staff record deactivated successfully'), origin);
	} catch (error) {
		const message = formatError(error);
		console.error('Error deactivating staff record:', error);
		return withCors(ApiResponse.error(message, 500), origin);
	}
}
