import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { PLATFORM_MODULES } from '@/app/lib/modules';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/super-admin/analytics/module-adoption
// Per-module count of companies with it enabled, for the dashboard's
// Module Adoption widget. Archived modules are excluded.
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		requireRole(token, ['SUPER_ADMIN']);

		const [modules, totalCompanies, accessCounts] = await Promise.all([
			(prisma as any).platformModule.findMany({
				where: { archived: false },
				select: { id: true, key: true, name: true },
			}),
			prisma.company.count({ where: { archived: 0 } }),
			(prisma as any).companyModuleAccess.groupBy({
				by: ['moduleId'],
				where: { enabled: true },
				_count: { _all: true },
			}),
		]);

		const countByModuleId = new Map<string, number>(accessCounts.map((row: any) => [row.moduleId, row._count._all]));

		const items = modules
			.map((m: any) => {
				const canonical = PLATFORM_MODULES.find((platformModule) => platformModule.key === m.key);
				const companiesEnabled = countByModuleId.get(m.id) ?? 0;
				return {
					moduleKey: m.key,
					moduleName: canonical?.name || m.name,
					companiesEnabled,
					totalCompanies,
					adoptionPct: totalCompanies > 0 ? Math.round((companiesEnabled / totalCompanies) * 100) : 0,
				};
			})
			.sort((a: any, b: any) => b.adoptionPct - a.adoptionPct);

		return withCors(ApiResponse.success({ items, totalCompanies }), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
