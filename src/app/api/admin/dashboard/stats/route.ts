// src/app/api/admin/dashboard/stats/route.ts
import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { getSuperAdminStats, getAdminStats, getHRStats, getStaffStats } from '@/app/lib/admin/dashboard-stats-helpers';

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
		const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF']);

		// Parse query parameters
		const { searchParams } = new URL(request.url);
		const year = searchParams.get('year') || new Date().getFullYear().toString();
		const month = searchParams.get('month'); // Can be null or string
		const companyId = searchParams.get('companyId');

		// Initialize response object
		const response: any = {
			userRole: user.role,
			period: {
				year: parseInt(year),
				month: month ? parseInt(month) : null,
				currentDate: new Date().toISOString().split('T')[0],
			},
		};

		// Get accessible companies based on role
		let accessibleCompanyIds: string[] = [];
		const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
		const currentYear = parseInt(year);

		// Company access logic
		if (user.role === 'SUPER_ADMIN') {
			// SUPER_ADMIN can access all non-archived companies
			const companies = await prisma.company.findMany({
				where: { archived: 0 },
				select: { id: true },
			});
			accessibleCompanyIds = companies.map((c) => c.id);
		} else if (user.role === 'ADMIN' || user.role === 'HR') {
			// ADMIN/HR can access only their assigned companies
			const userCompanies = await prisma.userCompany.findMany({
				where: {
					userId: user.userId,
					company: { archived: 0 },
				},
				select: { companyId: true },
			});
			accessibleCompanyIds = userCompanies.map((uc) => uc.companyId);

			if (accessibleCompanyIds.length === 0) {
				return withCors(ApiResponse.error('No companies assigned to your account', 403), origin);
			}
		}

		// Apply company filter if specified
		let targetCompanyIds = accessibleCompanyIds;
		if (companyId && accessibleCompanyIds.includes(companyId)) {
			targetCompanyIds = [companyId];
		}

		// ROLE-SPECIFIC STATISTICS
		switch (user.role) {
			case 'SUPER_ADMIN':
				response.stats = await getSuperAdminStats(targetCompanyIds, currentYear, currentMonth);
				break;

			case 'ADMIN':
				response.stats = await getAdminStats(user.userId, targetCompanyIds, currentYear, currentMonth);
				break;

			case 'HR':
				response.stats = await getHRStats(user.userId, targetCompanyIds, currentYear, currentMonth);
				break;

			case 'STAFF':
				response.stats = await getStaffStats(user.userId, currentYear, currentMonth);
				break;

			default:
				return withCors(ApiResponse.error('Invalid user role', 403), origin);
		}

		return withCors(ApiResponse.success(response, 'Dashboard statistics fetched successfully'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

// ==================== STATISTICS FUNCTIONS ====================








