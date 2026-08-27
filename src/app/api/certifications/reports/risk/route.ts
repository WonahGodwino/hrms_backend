import { NextRequest } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/certifications/reports/risk?companyId=&riskLevel=&department=&certType=&search=&page=&limit=&sortField=&sortDirection=
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const { searchParams } = new URL(req.url);
		const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'));
		if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin);
		const { companyId } = resolved;
		const riskLevel = searchParams.get('riskLevel');
		const department = searchParams.get('department');
		const certType = searchParams.get('certType');
		const search = searchParams.get('search')?.trim();
		const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
		const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10) || 10));
		const sortField = searchParams.get('sortField') ?? 'expiryDate';
		const sortDirection = (searchParams.get('sortDirection') || 'asc').toLowerCase() === 'asc' ? 'asc' : 'desc';

		const now = new Date();
		const in7 = new Date(now.getTime() + 7 * 86_400_000);
		const in30 = new Date(now.getTime() + 30 * 86_400_000);

		const baseWhere: any = { companyId };
		baseWhere.status = { not: 'Archived' };
		if (department) baseWhere.employee = { department };
		if (certType) baseWhere.certificationType = { type: certType };

		// build risk-specific where conditions
		const riskWhere: any = { ...baseWhere };

		// Determine risk membership using Prisma where clauses where possible
		// Safe = valid with document and >30 days to expiry
		const safeWhere = { ...baseWhere, status: 'Valid', hasDocument: true, expiryDate: { gt: in30 } };
		// Warning = expiring in 8-30 days
		const warningWhere = { ...baseWhere, expiryDate: { gte: in7, lte: in30 } };
		// Risk = expired OR missing document OR expiring in <=7 days
		const riskCond = {
			OR: [{ status: 'Expired' }, { hasDocument: false }, { expiryDate: { lte: in7 } }],
		};

		// Apply search
		if (search) {
			baseWhere.AND = [{ OR: [{ 'employee.firstName': { contains: search, mode: 'insensitive' } }] }];
		}

		// Compute stats
		const [safeCount, warningCount, riskCount, total] = await Promise.all([
			prisma.certificationRecord.count({ where: safeWhere }),
			prisma.certificationRecord.count({ where: warningWhere }),
			prisma.certificationRecord.count({ where: { ...baseWhere, ...riskCond } }),
			prisma.certificationRecord.count({ where: baseWhere }),
		]);

		// Build filter options
		const depts = await prisma.department.findMany({ where: { companyId }, select: { name: true }, take: 100 });
		const certTypes = await prisma.certificationType.findMany({ where: { companyId }, select: { type: true }, distinct: ['type'] });
		const filterOptions = { departments: depts.map((d) => d.name), certTypes: certTypes.map((t) => t.type), riskLevels: ['Safe', 'Warning', 'Risk'] };

		// Query items with proper certType handling (join filters)
		const whereForItems: any = { companyId, status: { not: 'Archived' } };
		if (department) whereForItems.employee = { department };
		if (certType) whereForItems.certificationType = { type: certType };
		if (search) {
			whereForItems.AND = [
				...(whereForItems.AND ?? []),
				{
					OR: [
						{ certIdNumber: { contains: search, mode: 'insensitive' } },
						{ employee: { firstName: { contains: search, mode: 'insensitive' } } },
						{ employee: { lastName: { contains: search, mode: 'insensitive' } } },
					],
				},
			];
		}

		// apply riskLevel filter after fetching page to keep pagination accurate per backend requirement
		const rawItems = await prisma.certificationRecord.findMany({
			where: whereForItems,
			include: { employee: { select: { id: true, firstName: true, lastName: true, email: true, department: true } }, certificationType: true, documents: true },
			orderBy: { [sortField]: sortDirection },
			skip: (page - 1) * limit,
			take: limit,
		});

		// compute risk level for each item
		const itemsWithRisk = rawItems.map((r) => {
			const daysToExpiry = r.expiryDate ? Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86_400_000) : null;
			const hasDoc = r.hasDocument || (r.documents && r.documents.length > 0);
			let level = 'Safe';
			if (!hasDoc || (daysToExpiry !== null && daysToExpiry <= 0) || (daysToExpiry !== null && daysToExpiry <= 7)) level = 'Risk';
			else if (daysToExpiry !== null && daysToExpiry <= 30) level = 'Warning';
			return { ...r, riskLevel: level };
		});

		// optionally filter by riskLevel
		const finalItems = riskLevel ? itemsWithRisk.filter((i) => i.riskLevel === riskLevel) : itemsWithRisk;

		const pages = Math.max(1, Math.ceil(total / limit));

		return withCors(
			ApiResponse.success({
				items: finalItems,
				total,
				page,
				pageSize: limit,
				pages,
				stats: { total, safe: safeCount, warning: warningCount, risk: riskCount },
				filterOptions,
			}),
			origin
		);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
