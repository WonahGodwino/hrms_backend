// src/app/api/admin/staff/bulk/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import validator from 'validator';

import { requireRole } from '@/app/lib/auth';
import { withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse } from '@/app/lib/utils';
import { publicErrorMessage } from '@/app/lib/errors/public-error';
import { forCompany } from '@/app/lib/data/tenant';
import { sanitizeString } from '@/app/lib/admin/route-helpers';
import { readJsonBody } from '@/app/lib/validation/request-body';
import { bulkDeleteStaffBodySchema } from '@/app/lib/validation/payroll-staff-schemas';



// Reuse the same access check helper
async function checkStaffAccess(currentUser: any, staffCompanyId: string): Promise<boolean> {
	if (currentUser.role === 'SUPER_ADMIN') {
		return true;
	}

	const userAssignments = await forCompany(staffCompanyId).userCompany.findMany({
		where: {
			userId: currentUser.userId
		},
	});

	return userAssignments.length > 0;
}

export async function OPTIONS(request: NextRequest) {
	const origin = request.headers.get('origin');
	return withCors(new NextResponse(null, { status: 200 }), origin);
}

export async function DELETE(request: NextRequest) {
	const origin = request.headers.get('origin');

	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) {
			return withCors(ApiResponse.error('Authorization header missing', 401), origin);
		}

		const token = authHeader.replace('Bearer ', '');
		const currentUser = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR']);

		// Parse request body to get IDs array
		const parsedBody = await readJsonBody(request, bulkDeleteStaffBodySchema);
		if (!parsedBody.ok) return withCors(ApiResponse.error(parsedBody.issues.length ? parsedBody.message : 'Invalid JSON payload', 400), origin);
		const body = parsedBody.data;

		const { ids } = body;

		// Validate IDs array
		if (!ids || !Array.isArray(ids) || ids.length === 0) {
			return withCors(ApiResponse.error('Invalid or empty IDs array', 400), origin);
		}

		// Set a reasonable limit for bulk operations
		if (ids.length > 100) {
			return withCors(ApiResponse.error('Maximum 100 staff records can be deactivated at once', 400), origin);
		}

		// Sanitize and validate each ID
		const sanitizedIds: string[] = [];
		for (const id of ids) {
			const sanitizedId = sanitizeString(id);
			if (!sanitizedId || !validator.isLength(sanitizedId, { min: 1, max: 100 })) {
				return withCors(ApiResponse.error(`Invalid staff ID format: ${id}`, 400), origin);
			}
			sanitizedIds.push(sanitizedId);
		}

		// Check which staff records exist and are active
		const existingStaff = await prisma.staffRecord.findMany({
			where: {
				id: { in: sanitizedIds },
				isActive: true, // Only get active records
			},
			select: {
				id: true,
				companyId: true,
				staffId: true,
				email: true,
				role: true,
			},
		});

		if (existingStaff.length === 0) {
			return withCors(ApiResponse.error('No active staff records found with the provided IDs', 404), origin);
		}

		// Find which IDs weren't found or are already inactive
		const foundIds = existingStaff.map((s) => s.id);
		const notFoundIds = sanitizedIds.filter((id) => !foundIds.includes(id));

		// Check if current user has access to all staff records' companies
		if (currentUser.role !== 'SUPER_ADMIN') {
			// Get unique company IDs from staff records
			const companyIds = [...new Set(existingStaff.map((s) => s.companyId))];

			// Check access for each company
			for (const companyId of companyIds) {
				const hasAccess = await checkStaffAccess(currentUser, companyId);
				if (!hasAccess) {
					return withCors(ApiResponse.error(`You do not have access to deactivate staff records from company ${companyId}`, 403), origin);
				}
			}
		}

		// Prevent deactivating own account
		if (foundIds.includes(currentUser.userId)) {
			return withCors(ApiResponse.error('You cannot deactivate your own account. Please remove your ID from the list.', 400), origin);
		}

		// Perform bulk soft delete
		const deactivatedStaff = await prisma.staffRecord.updateMany({
			where: {
				id: { in: foundIds },
			},
			data: {
				isActive: false,
				updatedBy: currentUser.userId,
				updatedAt: new Date(),
			},
		});

		// Fetch the updated records to return (with selected fields like your single delete)
		const updatedRecords = await prisma.staffRecord.findMany({
			where: { id: { in: foundIds } },
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

		// Log the bulk deactivation
		console.log(`${deactivatedStaff.count} staff records deactivated by ${currentUser.role} (${currentUser.email})`);
		if (notFoundIds.length > 0) {
			console.log(`The following IDs were not found or already inactive: ${notFoundIds.join(', ')}`);
		}

		// Sanitize response data (mirroring your single delete sanitization)
		const sanitizedResponse = updatedRecords.map((record) => ({
			...record,
			firstName: validator.escape(record.firstName),
			lastName: validator.escape(record.lastName),
			email: validator.escape(record.email),
			updatedBy: record.updatedBy ? validator.escape(record.updatedBy) : null,
		}));

		return withCors(
			ApiResponse.success(
				{
					deactivated: sanitizedResponse,
					count: deactivatedStaff.count,
					notFound: notFoundIds,
					totalRequested: ids.length,
				},
				`${deactivatedStaff.count} staff records deactivated successfully`
			),
			origin
		);
	} catch (error) {
		const message = publicErrorMessage(error);
		console.error('Error bulk deactivating staff records:', error);
		return withCors(ApiResponse.error(message, 500), origin);
	}
}
