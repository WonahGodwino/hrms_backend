import { NextRequest } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/certifications/reports/department?companyId=&department=&search=&status=&page=&limit=&sortField=&sortDirection=
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const { searchParams } = new URL(req.url);
		const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'));
		if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin);
		const { companyId } = resolved;
		const department = searchParams.get('department');
		const search = searchParams.get('search')?.trim();
		const status = searchParams.get('status');
		const pageParam = parseInt(searchParams.get('page') ?? '1', 10) || 1;
		const limitParam = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10) || 10));
		const sortField = searchParams.get('sortField') ?? 'issueDate';
		const sortDirection = (searchParams.get('sortDirection') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

		const where: any = { companyId };
		if (department) where.employee = { department };
		if (status) where.status = status;

		if (search) {
			where.AND = [
				...(where.AND ?? []),
				{
					OR: [
						{ certIdNumber: { contains: search, mode: 'insensitive' } },
						{ employee: { firstName: { contains: search, mode: 'insensitive' } } },
						{ employee: { lastName: { contains: search, mode: 'insensitive' } } },
						{ employee: { email: { contains: search, mode: 'insensitive' } } },
						{ certificationType: { name: { contains: search, mode: 'insensitive' } } },
					],
				},
			];
		}

		const total = await prisma.certificationRecord.count({ where });

		let orderBy: any = { issueDate: sortDirection };
		if (sortField === 'expiryDate') orderBy = { expiryDate: sortDirection };
		else if (sortField === 'createdAt') orderBy = { createdAt: sortDirection };
		else if (sortField === 'status') orderBy = { status: sortDirection };
		else if (sortField === 'employeeName') orderBy = { employee: { firstName: sortDirection } };

		const items = await prisma.certificationRecord.findMany({
			where,
			include: {
				employee: { select: { id: true, firstName: true, lastName: true, email: true, department: true, staffId: true, role: true } },
				certificationType: { select: { id: true, name: true, type: true, authority: true } },
				documents: { select: { id: true, fileName: true, fileUrl: true, fileType: true, createdAt: true } },
			},
			orderBy,
			skip: (pageParam - 1) * limitParam,
			take: limitParam,
		});

		// stats
		const now = new Date();
		const expiringSoonDate = new Date(now.getTime() + 30 * 86_400_000);

		const fullyCompliant = await prisma.certificationRecord.count({ where: { ...where, status: 'Valid', hasDocument: true } });
		const expiringSoon = await prisma.certificationRecord.count({ where: { ...where, expiryDate: { gte: now, lte: expiringSoonDate } } });
		const expiredOrMissing = await prisma.certificationRecord.count({ where: { ...where, OR: [{ status: 'Expired' }, { hasDocument: false }] } });

		const complianceRate = total > 0 ? Math.round((fullyCompliant / total) * 100) : 0;

		const pageCount = Math.max(1, Math.ceil(total / limitParam));

		return withCors(
			ApiResponse.success({
				items,
				total,
				page: pageParam,
				pageSize: limitParam,
				pages: pageCount,
				stats: { total, fullyCompliant, expiringSoon, expiredOrMissing, complianceRate },
			}),
			origin
		);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
