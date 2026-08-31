// src/app/api/admin/staff/edit/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import validator from 'validator';

import { requireRole } from '@/app/lib/auth';
import { withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, formatError } from '@/app/lib/utils';
import { findIdentifierHolder, describeIdentifierCollision } from '@/app/lib/staff/identifierCollision';

type RouteParams = {
	params: {
		id: string;
	};
};

// Sanitization helper functions
function sanitizeString(input: string | null): string | null {
	if (!input) return null;
	// Remove HTML tags and limit length
	return validator.escape(validator.stripLow(input.trim()));
}

function sanitizeEmail(email: string): string {
	// Normalize email, remove invalid characters, and escape
	const normalized =
		validator.normalizeEmail(email, {
			gmail_remove_dots: false,
			gmail_remove_subaddress: false,
			outlookdotcom_remove_subaddress: false,
			yahoo_remove_subaddress: false,
			icloud_remove_subaddress: false,
		}) || email;

	return validator.escape(validator.stripLow(normalized.trim()));
}

function sanitizePhone(phone: string | null): string | null {
	if (!phone) return null;
	// Remove all non-numeric characters except + at beginning
	const cleaned = phone.replace(/[^\d+]/g, '');
	// Validate it looks like a phone number
	if (!validator.isMobilePhone(cleaned, 'any', { strictMode: false })) {
		return null;
	}
	return cleaned;
}

function sanitizeBankAccount(account: string | null): string | null {
	if (!account) return null;
	// Remove all non-numeric characters
	const cleaned = account.replace(/\D/g, '');
	// Basic validation for account numbers (usually 10-20 digits)
	if (cleaned.length < 8 || cleaned.length > 20) {
		return null;
	}
	return cleaned;
}

function sanitizeBVN(bvn: string | null): string | null {
	if (!bvn) return null;
	// Remove all non-numeric characters
	const cleaned = bvn.replace(/\D/g, '');
	// BVN should be 11 digits
	if (cleaned.length !== 11) {
		return null;
	}
	return cleaned;
}

function sanitizeEncodedId(encodedId: string | null): string | null {
	if (!encodedId) return null;
	// Allow alphanumeric and some special characters, but escape HTML
	const cleaned = encodedId.replace(/[^a-zA-Z0-9\-_]/g, '');
	return validator.escape(cleaned.trim());
}

export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get('origin');
	return withCors(new NextResponse(null, { status: 200 }), origin);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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
				phone: true,
				bankName: true,
				accountNumber: true,
				bvn: true,
				isRegistered: true,
				role: true,
				isActive: true,
				encodedId: true,
				companyId: true,
				company: {
					select: {
						id: true,
						companyName: true,
						email: true,
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

		// Escape output data to prevent XSS in API responses
		const sanitizedResponse = {
			...staffRecord,
			firstName: validator.escape(staffRecord.firstName),
			lastName: validator.escape(staffRecord.lastName),
			email: validator.escape(staffRecord.email),
			department: staffRecord.department ? validator.escape(staffRecord.department) : null,
			position: validator.escape(staffRecord.position),
			phone: staffRecord.phone ? validator.escape(staffRecord.phone) : null,
			bankName: staffRecord.bankName ? validator.escape(staffRecord.bankName) : null,
			accountNumber: staffRecord.accountNumber ? validator.escape(staffRecord.accountNumber) : null,
			bvn: staffRecord.bvn ? '***' + staffRecord.bvn.slice(-4) : null, // Mask BVN for security
			encodedId: staffRecord.encodedId ? validator.escape(staffRecord.encodedId) : null,
			company: staffRecord.company
				? {
						...staffRecord.company,
						companyName: validator.escape(staffRecord.company.companyName),
						email: validator.escape(staffRecord.company.email),
				  }
				: null,
			createdBy: staffRecord.createdBy ? validator.escape(staffRecord.createdBy) : null,
		};

		return withCors(ApiResponse.success(sanitizedResponse, 'Staff record retrieved successfully'), origin);
	} catch (error) {
		const message = formatError(error);
		console.error('Error fetching staff record:', error);
		return withCors(ApiResponse.error(message, 500), origin);
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
		const currentUser = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']);

		const { id } = params;

		// Sanitize and validate ID parameter
		const sanitizedId = sanitizeString(id);
		if (!sanitizedId || !validator.isLength(sanitizedId, { min: 1, max: 100 })) {
			return withCors(ApiResponse.error('Invalid staff ID', 400), origin);
		}

		// Parse and validate request body
		let body;
		try {
			body = await request.json();
		} catch (error) {
			return withCors(ApiResponse.error('Invalid JSON payload', 400), origin);
		}

		// Check if staff record exists
		const existingStaff = await prisma.staffRecord.findUnique({
			where: { id: sanitizedId },
			select: {
				id: true,
				companyId: true,
				email: true,
				staffId: true,
			},
		});

		if (!existingStaff) {
			return withCors(ApiResponse.error('Staff record not found', 404), origin);
		}

		// Check if current user has access to this staff's company
		if (currentUser.role !== 'SUPER_ADMIN') {
			const hasAccess = await checkStaffAccess(currentUser, existingStaff.companyId);
			if (!hasAccess) {
				return withCors(ApiResponse.error('You do not have access to update this staff record', 403), origin);
			}
		}

		// Extract and sanitize update fields
		const {
			email,
			staffId,
			firstName,
			lastName,
			department,
			position,
			phone,
			bankName,
			accountNumber,
			bvn,
			isRegistered,
			role,
			isActive,
			encodedId,
			// Explicitly exclude these fields
			password,
			companyId,
			...rest
		} = body;

		// Validate allowed fields
		const allowedFields = [
			'email',
			'staffId',
			'firstName',
			'lastName',
			'department',
			'position',
			'phone',
			'bankName',
			'accountNumber',
			'bvn',
			'isRegistered',
			'role',
			'isActive',
			'encodedId',
		];

		// Check for invalid fields
		const invalidFields = Object.keys(rest).filter((key) => !allowedFields.includes(key));
		if (invalidFields.length > 0) {
			return withCors(ApiResponse.error(`Invalid fields: ${invalidFields.join(', ')}. Password and companyId cannot be updated through this endpoint.`, 400), origin);
		}

		// Build update data object with sanitized values
		const updateData: any = {};

		if (email !== undefined) {
			if (!email || typeof email !== 'string') {
				return withCors(ApiResponse.error('Email must be a non-empty string', 400), origin);
			}
			const sanitizedEmail = sanitizeEmail(email);
			if (!validator.isEmail(sanitizedEmail)) {
				return withCors(ApiResponse.error('Invalid email format', 400), origin);
			}
			const emailHolder = await findIdentifierHolder(existingStaff.companyId, 'email', sanitizedEmail, sanitizedId);
			if (emailHolder) {
				return withCors(ApiResponse.error(describeIdentifierCollision('email', sanitizedEmail, emailHolder), 400), origin);
			}
			updateData.email = sanitizedEmail;
		}

		if (staffId !== undefined) {
			if (!staffId || typeof staffId !== 'string') {
				return withCors(ApiResponse.error('Staff ID must be a non-empty string', 400), origin);
			}
			const sanitizedStaffId = sanitizeString(staffId);
			if (!sanitizedStaffId || !validator.isLength(sanitizedStaffId, { min: 1, max: 100 })) {
				return withCors(ApiResponse.error('Staff ID must be 1-100 characters', 400), origin);
			}
			const staffIdHolder = await findIdentifierHolder(existingStaff.companyId, 'staffId', sanitizedStaffId, sanitizedId);
			if (staffIdHolder) {
				return withCors(ApiResponse.error(describeIdentifierCollision('staffId', sanitizedStaffId, staffIdHolder), 400), origin);
			}
			updateData.staffId = sanitizedStaffId;
		}

		if (firstName !== undefined) {
			if (!firstName || typeof firstName !== 'string') {
				return withCors(ApiResponse.error('First name must be a non-empty string', 400), origin);
			}
			const sanitizedFirstName = sanitizeString(firstName);
			if (!sanitizedFirstName || !validator.isLength(sanitizedFirstName, { min: 1, max: 100 })) {
				return withCors(ApiResponse.error('First name must be 1-100 characters', 400), origin);
			}
			updateData.firstName = sanitizedFirstName;
		}

		if (lastName !== undefined) {
			if (!lastName || typeof lastName !== 'string') {
				return withCors(ApiResponse.error('Last name must be a non-empty string', 400), origin);
			}
			const sanitizedLastName = sanitizeString(lastName);
			if (!sanitizedLastName || !validator.isLength(sanitizedLastName, { min: 1, max: 100 })) {
				return withCors(ApiResponse.error('Last name must be 1-100 characters', 400), origin);
			}
			updateData.lastName = sanitizedLastName;
		}

		if (department !== undefined) {
			if (!department || typeof department !== 'string') {
				return withCors(ApiResponse.error('Department must be a non-empty string', 400), origin);
			}
			const sanitizedDepartment = sanitizeString(department);
			if (!sanitizedDepartment || !validator.isLength(sanitizedDepartment, { min: 1, max: 100 })) {
				return withCors(ApiResponse.error('Department must be 1-100 characters', 400), origin);
			}
			updateData.department = sanitizedDepartment;
		}

		if (position !== undefined) {
			if (!position || typeof position !== 'string') {
				return withCors(ApiResponse.error('Position must be a non-empty string', 400), origin);
			}
			const sanitizedPosition = sanitizeString(position);
			if (!sanitizedPosition || !validator.isLength(sanitizedPosition, { min: 1, max: 100 })) {
				return withCors(ApiResponse.error('Position must be 1-100 characters', 400), origin);
			}
			updateData.position = sanitizedPosition;
		}

		if (phone !== undefined) {
			if (phone !== null && typeof phone !== 'string') {
				return withCors(ApiResponse.error('Phone must be a string or null', 400), origin);
			}
			const sanitizedPhone = sanitizePhone(phone);
			updateData.phone = sanitizedPhone;
		}

		if (bankName !== undefined) {
			if (bankName !== null && typeof bankName !== 'string') {
				return withCors(ApiResponse.error('Bank name must be a string or null', 400), origin);
			}
			const sanitizedBankName = sanitizeString(bankName);
			if (sanitizedBankName && !validator.isLength(sanitizedBankName, { max: 100 })) {
				return withCors(ApiResponse.error('Bank name must be less than 100 characters', 400), origin);
			}
			updateData.bankName = sanitizedBankName;
		}

		if (accountNumber !== undefined) {
			if (accountNumber !== null && typeof accountNumber !== 'string') {
				return withCors(ApiResponse.error('Account number must be a string or null', 400), origin);
			}
			const sanitizedAccountNumber = sanitizeBankAccount(accountNumber);
			if (sanitizedAccountNumber === null && accountNumber !== null) {
				return withCors(ApiResponse.error('Invalid account number format', 400), origin);
			}
			updateData.accountNumber = sanitizedAccountNumber;
		}

		if (bvn !== undefined) {
			if (bvn !== null && typeof bvn !== 'string') {
				return withCors(ApiResponse.error('BVN must be a string or null', 400), origin);
			}
			const sanitizedBVN = sanitizeBVN(bvn);
			if (sanitizedBVN === null && bvn !== null) {
				return withCors(ApiResponse.error('BVN must be 11 digits', 400), origin);
			}
			updateData.bvn = sanitizedBVN;
		}

		if (isRegistered !== undefined) {
			if (typeof isRegistered !== 'boolean') {
				return withCors(ApiResponse.error('isRegistered must be a boolean', 400), origin);
			}
			updateData.isRegistered = isRegistered;
		}

		if (role !== undefined) {
			if (!role || typeof role !== 'string') {
				return withCors(ApiResponse.error('Role must be a non-empty string', 400), origin);
			}
			const sanitizedRole = sanitizeString(role);
			const allowedRoles = ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'];
			if (!sanitizedRole || !allowedRoles.includes(sanitizedRole)) {
				return withCors(ApiResponse.error(`Role must be one of: ${allowedRoles.join(', ')}`, 400), origin);
			}
			updateData.role = sanitizedRole;
		}

		if (isActive !== undefined) {
			if (typeof isActive !== 'boolean') {
				return withCors(ApiResponse.error('isActive must be a boolean', 400), origin);
			}
			updateData.isActive = isActive;
		}

		if (encodedId !== undefined) {
			if (encodedId !== null && typeof encodedId !== 'string') {
				return withCors(ApiResponse.error('Encoded ID must be a string or null', 400), origin);
			}
			const sanitizedEncodedId = sanitizeEncodedId(encodedId);
			if (sanitizedEncodedId && !validator.isLength(sanitizedEncodedId, { max: 100 })) {
				return withCors(ApiResponse.error('Encoded ID must be less than 100 characters', 400), origin);
			}
			updateData.encodedId = sanitizedEncodedId;
		}

		// If no valid fields to update
		if (Object.keys(updateData).length === 0) {
			return withCors(ApiResponse.error('No valid fields provided for update', 400), origin);
		}

		// Add updatedBy and updatedAt
		updateData.updatedBy = currentUser.email || currentUser.userId;
		updateData.updatedAt = new Date();

		// Update staff record
		const updatedStaff = await prisma.staffRecord.update({
			where: { id: sanitizedId },
			data: updateData,
			select: {
				id: true,
				staffId: true,
				email: true,
				firstName: true,
				lastName: true,
				department: true,
				position: true,
				phone: true,
				bankName: true,
				accountNumber: true,
				bvn: true,
				isRegistered: true,
				role: true,
				isActive: true,
				encodedId: true,
				companyId: true,
				company: {
					select: {
						id: true,
						companyName: true,
					},
				},
				updatedAt: true,
				updatedBy: true,
			},
		});

		// Log the update
		console.log(`Staff record ${sanitizedId} updated by ${currentUser.role} (${currentUser.email})`);

		// Sanitize response data
		const sanitizedResponse = {
			...updatedStaff,
			firstName: validator.escape(updatedStaff.firstName),
			lastName: validator.escape(updatedStaff.lastName),
			email: validator.escape(updatedStaff.email),
			department: updatedStaff.department ? validator.escape(updatedStaff.department) : null,
			position: updatedStaff.position ? validator.escape(updatedStaff.position) : null,
			phone: updatedStaff.phone ? validator.escape(updatedStaff.phone) : null,
			bankName: updatedStaff.bankName ? validator.escape(updatedStaff.bankName) : null,
			accountNumber: updatedStaff.accountNumber ? '***' + updatedStaff.accountNumber?.slice(-4) : null, // Mask account number
			bvn: updatedStaff.bvn ? '***' + updatedStaff.bvn.slice(-4) : null, // Mask BVN
			encodedId: updatedStaff.encodedId ? validator.escape(updatedStaff.encodedId) : null,
			company: updatedStaff.company
				? {
						...updatedStaff.company,
						companyName: validator.escape(updatedStaff.company.companyName),
				  }
				: null,
			updatedBy: updatedStaff.updatedBy ? validator.escape(updatedStaff.updatedBy) : null,
		};

		return withCors(ApiResponse.success(sanitizedResponse, 'Staff record updated successfully'), origin);
	} catch (error) {
		const message = formatError(error);
		console.error('Error updating staff record:', error);

		// Handle unique constraint violations
		if (message.includes('Unique constraint failed')) {
			return withCors(ApiResponse.error('Email or staff ID already exists in this company', 400), origin);
		}

		return withCors(ApiResponse.error(message, 500), origin);
	}
}

// Helper function to check if user has access to staff's company
async function checkStaffAccess(currentUser: any, staffCompanyId: string): Promise<boolean> {
	if (currentUser.role === 'SUPER_ADMIN') {
		return true;
	}

	// For HR/ADMIN, check if they have access to the staff's company
	const userAssignments = await prisma.userCompany.findMany({
		where: {
			userId: currentUser.userId,
			companyId: staffCompanyId,
		},
	});

	return userAssignments.length > 0;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
