// src/app/api/staff/records/route.ts
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
		const includeInactive = searchParams.get('includeInactive') === 'true';

		// ✅ CHANGE THIS: Get companyId from query param instead of token
		const companyId = searchParams.get('companyId');

		const skip = (page - 1) * limit;

		// Base where clause. The query MUST always be scoped to a single company so
		// staff from other companies (that an ADMIN/SUPER_ADMIN can otherwise access)
		// never leak into the results.
		const where: any = {
			isActive: includeInactive ? undefined : true,
			company: { archived: 0 },
		};

		// Resolve the effective company:
		//  - No companyId at all: SUPER_ADMIN falls back to their own company (NEVER
		//    all companies); other roles must supply one.
		//  - companyId supplied: ADMIN/HR/MANAGER must actually have access to it.
		if (!companyId) {
			if (user.role === 'SUPER_ADMIN' && user.companyId) {
				where.companyId = user.companyId;
			} else {
				return withCors(ApiResponse.error('Company ID is required. Please select a company.', 400), origin);
			}
		} else {
			if (user.role !== 'SUPER_ADMIN') {
				const hasAccess = await prisma.userCompany.findFirst({
					where: { userId: user.userId, companyId },
					select: { id: true },
				});
				// Fall back to the token company rather than leaking a company they
				// aren't assigned to.
				if (!hasAccess && companyId !== user.companyId) {
					return withCors(ApiResponse.error('You do not have access to this company', 403), origin);
				}
			}
			where.companyId = companyId;
		}

		// Department filter if provided
		if (department) {
			where.department = { contains: department, mode: 'insensitive' };
		}

		// Search functionality
		if (search) {
			where.OR = [
				{ firstName: { contains: search, mode: 'insensitive' } },
				{ lastName: { contains: search, mode: 'insensitive' } },
				{ staffId: { contains: search, mode: 'insensitive' } },
				{ email: { contains: search, mode: 'insensitive' } },
			];
		}

		// Fetch staff records and total count as before
		const [staffRecords, totalCount] = await Promise.all([
			prisma.staffRecord.findMany({
				where,
				skip,
				take: limit,
				orderBy: { createdAt: 'desc' },
				select: {
					id: true,
					staffId: true,
					email: true,
					firstName: true,
					lastName: true,
					role: true,
					department: true,
					position: true,
					phone: true,
					isActive: true,
					createdAt: true,
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

		// Get all staffIds in the current result set
		const staffIds = staffRecords.map((r) => r.staffId);
		// Get all staffIds that are referenced as managerId in the same company
		let managerStaffIds: string[] = [];
		if (staffIds.length > 0 && companyId) {
			const managers = await prisma.staffRecord.findMany({
				where: {
					companyId,
					managerId: { in: staffIds },
				},
				select: { managerId: true },
			});
			managerStaffIds = Array.from(new Set(managers.map((m) => m.managerId!).filter(Boolean)));
		}

		// Get active and inactive counts
		let activeCount = 0;
		let inactiveCount = 0;

		if (includeInactive) {
			const activeWhere = { ...where, isActive: true };
			const inactiveWhere = { ...where, isActive: false };

			activeCount = await prisma.staffRecord.count({ where: activeWhere });
			inactiveCount = await prisma.staffRecord.count({ where: inactiveWhere });
		} else {
			activeCount = totalCount;
			inactiveCount = 0;
		}

		// Format the response and add isManager field
		const formattedStaffRecords = staffRecords.map((record) => {
			// A staff is a manager if their staffId is referenced as a managerId in the same company
			// Or if their role is HR, ADMIN, or MANAGER and their staffId is found in managerId
			const isManager = managerStaffIds.includes(record.staffId);
			return {
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
				companyId: record.companyId,
				companyName: record.company?.companyName || 'Unknown',
				status: record.isActive ? 'Active' : 'Inactive',
				isManager,
			};
		});

		return withCors(
			ApiResponse.success({
				staffRecords: formattedStaffRecords,
				pagination: {
					page,
					limit,
					totalCount,
					totalPages: Math.ceil(totalCount / limit),
				},
				counts: {
					active: activeCount,
					inactive: inactiveCount,
					total: activeCount + inactiveCount,
				},
				filters: {
					includeInactive,
					showing: includeInactive ? 'ALL_STAFF' : 'ACTIVE_ONLY',
				},
			}),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
