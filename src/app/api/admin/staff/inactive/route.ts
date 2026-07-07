// src/app/api/admin/staff/inactive/route.ts
import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

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
		const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'MANAGER', 'ADMIN']);

		const { searchParams } = new URL(request.url);
		const page = parseInt(searchParams.get('page') || '1', 10);
		const limit = parseInt(searchParams.get('limit') || '50', 10);
		const department = searchParams.get('department');
		const search = searchParams.get('search');
		const companyId = searchParams.get('companyId'); // ✅ REQUIRED
		const fromDate = searchParams.get('fromDate');
		const toDate = searchParams.get('toDate');

		// ✅ Validate companyId is provided
		if (!companyId) {
			return withCors(ApiResponse.error('Company ID is required. Please select a company.', 400), origin);
		}

		const skip = (page - 1) * limit;

		// Base where clause - ALWAYS isActive: false (inactive staff only)
		const where: any = {
			isActive: false, // Only inactive staff
			companyId: companyId, // ✅ Always filter by companyId
			company: { archived: 0 },
		};

		// ✅ SUPER_ADMIN can access any company, but still must provide companyId
		// Non-SUPER_ADMIN must have access to the company
		if (user.role !== 'SUPER_ADMIN') {
			const hasAccess = await checkStaffAccess(user, companyId);
			if (!hasAccess) {
				return withCors(ApiResponse.error('You do not have access to this company', 403), origin);
			}
		}

		// Additional filters
		if (department) {
			where.department = { contains: department, mode: 'insensitive' };
		}

		if (search) {
			where.OR = [
				{ firstName: { contains: search, mode: 'insensitive' } },
				{ lastName: { contains: search, mode: 'insensitive' } },
				{ staffId: { contains: search, mode: 'insensitive' } },
				{ email: { contains: search, mode: 'insensitive' } },
			];
		}

		// Date range filter (based on when they were deactivated)
		if (fromDate || toDate) {
			where.updatedAt = {};
			if (fromDate) {
				where.updatedAt.gte = new Date(fromDate);
			}
			if (toDate) {
				where.updatedAt.lte = new Date(toDate);
			}
		}

		// Fetch inactive staff records
		const [inactiveStaff, totalCount] = await Promise.all([
			prisma.staffRecord.findMany({
				where,
				skip,
				take: limit,
				orderBy: { updatedAt: 'desc' }, // Most recently deactivated first
				select: {
					id: true,
					staffId: true,
					email: true,
					firstName: true,
					lastName: true,
					department: true,
					position: true,
					phone: true,
					isActive: true,
					createdAt: true,
					updatedAt: true,
					updatedBy: true,
					companyId: true,
					company: {
						select: {
							id: true,
							companyName: true,
							archived: true,
						},
					},
				},
			}),
			prisma.staffRecord.count({ where }),
		]);

		// Get deactivation metadata
		const staffWithDeactivationInfo = inactiveStaff.map((record) => ({
			id: record.id,
			staffId: record.staffId,
			email: record.email,
			firstName: record.firstName,
			lastName: record.lastName,
			fullName: `${record.firstName} ${record.lastName}`,
			department: record.department,
			position: record.position,
			phone: record.phone,
			isActive: record.isActive,
			createdAt: record.createdAt,
			deactivatedAt: record.updatedAt,
			deactivatedBy: record.updatedBy || 'Unknown',
			companyId: record.companyId,
			companyName: record.company?.companyName || 'Unknown',
			status: 'Inactive',
		}));

		return withCors(
			ApiResponse.success({
				staffRecords: staffWithDeactivationInfo,
				pagination: {
					page,
					limit,
					totalCount,
					totalPages: Math.ceil(totalCount / limit),
				},
				filters: {
					companyId,
					department: department || null,
					search: search || null,
					dateRange: {
						from: fromDate || null,
						to: toDate || null,
					},
				},
			}),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

// Helper function to check user access
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
