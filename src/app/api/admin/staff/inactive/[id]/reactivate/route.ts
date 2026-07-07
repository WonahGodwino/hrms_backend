// src/app/api/admin/staff/inactive/[id]/reactivate/route.ts
import { NextRequest } from 'next/server';
import validator from 'validator';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, formatError } from '@/app/lib/utils';

type RouteParams = {
	params: {
		id: string;
	};
};

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
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

		// Get companyId from query params
		const { searchParams } = new URL(request.url);
		const companyId = searchParams.get('companyId'); // ✅ REQUIRED

		// ✅ Validate companyId
		if (!companyId) {
			return withCors(ApiResponse.error('Company ID is required. Please select a company.', 400), origin);
		}

		// Validate ID
		if (!id || !validator.isLength(id, { min: 1, max: 100 })) {
			return withCors(ApiResponse.error('Invalid staff ID', 400), origin);
		}

		// Check if staff exists and is inactive
		const existingStaff = await prisma.staffRecord.findUnique({
			where: { id },
			select: {
				id: true,
				staffId: true,
				email: true,
				firstName: true,
				lastName: true,
				isActive: true,
				companyId: true,
				role: true,
			},
		});

		if (!existingStaff) {
			return withCors(ApiResponse.error('Staff record not found', 404), origin);
		}

		// ✅ Verify staff belongs to the company
		if (existingStaff.companyId !== companyId) {
			return withCors(ApiResponse.error('Staff record does not belong to this company', 403), origin);
		}

		// ✅ Check if already active
		if (existingStaff.isActive === true) {
			return withCors(ApiResponse.error('Staff record is already active', 400), origin);
		}

		// Check if user has access to this staff's company
		if (currentUser.role !== 'SUPER_ADMIN') {
			const hasAccess = await checkStaffAccess(currentUser, companyId);
			if (!hasAccess) {
				return withCors(ApiResponse.error('You do not have access to reactivate this staff', 403), origin);
			}
		}

		// Reactivate by setting isActive: true
		const reactivatedStaff = await prisma.staffRecord.update({
			where: { id },
			data: {
				isActive: true,
				updatedBy: currentUser.email || currentUser.userId,
				updatedAt: new Date(),
			},
			select: {
				id: true,
				staffId: true,
				email: true,
				firstName: true,
				lastName: true,
				department: true,
				position: true,
				isActive: true,
				updatedAt: true,
				updatedBy: true,
				companyId: true,
				company: {
					select: {
						id: true,
						companyName: true,
					},
				},
			},
		});

		// Log the reactivation
		console.log(`Staff record ${id} in company ${companyId} reactivated by ${currentUser.role} (${currentUser.email})`);

		return withCors(
			ApiResponse.success(
				{
					...reactivatedStaff,
					fullName: `${reactivatedStaff.firstName} ${reactivatedStaff.lastName}`,
					status: 'Active',
					reactivatedAt: reactivatedStaff.updatedAt,
					reactivatedBy: reactivatedStaff.updatedBy,
				},
				'Staff record reactivated successfully'
			),
			origin
		);
	} catch (error) {
		const message = formatError(error);
		console.error('Error reactivating staff:', error);
		return withCors(ApiResponse.error(message, 500), origin);
	}
}

async function checkStaffAccess(currentUser: any, companyId: string): Promise<boolean> {
	if (currentUser.role === 'SUPER_ADMIN') return true;

	const userAssignments = await prisma.userCompany.findMany({
		where: {
			userId: currentUser.userId,
			companyId: companyId,
		},
	});

	return userAssignments.length > 0;
}
