// src/app/api/staff/transfer/search/route.ts
//
// Lightweight, purpose-built lookup for the Staff Transfer flow — deliberately
// separate from staff/records/route.ts's general list search so that route's
// existing "contains" behavior isn't touched. staffId uses startsWith (fast,
// precise prefix match); name/email keep the familiar "contains" pattern.
// Only role: 'STAFF' records are returned — ADMIN/HR/MANAGER move between
// companies via the existing UserCompany assignment flow instead.
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
		requireRole(token, ['ADMIN', 'SUPER_ADMIN']);

		const { searchParams } = new URL(request.url);
		const companyId = searchParams.get('companyId');
		const q = (searchParams.get('q') || '').trim();

		if (!companyId) {
			return withCors(ApiResponse.error('Company ID is required', 400), origin);
		}
		if (!q) {
			return withCors(ApiResponse.success([], 'No search term provided'), origin);
		}

		const results = await prisma.staffRecord.findMany({
			where: {
				companyId,
				role: 'STAFF',
				isActive: true,
				OR: [
					{ staffId: { startsWith: q, mode: 'insensitive' } },
					{ firstName: { contains: q, mode: 'insensitive' } },
					{ lastName: { contains: q, mode: 'insensitive' } },
					{ email: { contains: q, mode: 'insensitive' } }
				]
			},
			select: {
				id: true,
				staffId: true,
				firstName: true,
				lastName: true,
				email: true,
				department: true,
				position: true
			},
			take: 20,
			orderBy: { firstName: 'asc' }
		});

		return withCors(ApiResponse.success(results, 'Transfer candidates fetched successfully'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
