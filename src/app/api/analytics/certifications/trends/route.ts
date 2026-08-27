import { NextRequest, NextResponse } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/analytics/certifications/trends?companyId=&period=6m|3m|12m|ytd&department=
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER']);

		const { searchParams } = new URL(req.url);
		const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'));
		if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin);
		const { companyId } = resolved;
		const period = (searchParams.get('period') || '6m').toLowerCase();
		const department = searchParams.get('department') || null;

		const now = new Date();
		let months: number;
		let ytd = false;
		if (period === 'ytd') {
			months = now.getMonth() + 1;
			ytd = true;
		} else if (period.endsWith('m')) {
			months = Math.min(12, parseInt(period.replace('m', ''), 10) || 6);
		} else {
			months = 6;
		}

		const monthNames: string[] = [];
		const trendData: any[] = [];
		const monthlyRows: any[] = [];

		// build windowed months (oldest -> newest)
		for (let i = ytd ? months - 1 : months - 1; i >= 0; i--) {
			let start: Date;
			let end: Date;
			if (ytd) {
				start = new Date(now.getFullYear(), i, 1);
				end = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59);
			} else {
				start = new Date(now.getFullYear(), now.getMonth() - i, 1);
				end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
			}

			const monthLabel = start.toLocaleString('default', { month: 'short', year: 'numeric' });
			monthNames.push(monthLabel);

			const whereBase: any = {
				companyId,
				status: { not: 'Archived' },
				issueDate: { lte: end },
				OR: [{ expiryDate: null }, { expiryDate: { gte: start } }],
			};

			if (department) whereBase.employee = { department };

			const [total, compliant] = await Promise.all([
				prisma.certificationRecord.count({ where: whereBase }),
				prisma.certificationRecord.count({ where: { ...whereBase, status: 'Valid' } }),
			]);

			const riskCount = Math.max(0, total - compliant);
			const score = total > 0 ? Math.round((compliant / total) * 100) : 0;

			trendData.push({ month: monthLabel, score, compliance: score, risk: 100 - score });
			monthlyRows.push({ month: monthLabel, total, compliantCount: compliant, riskCount, score });
		}

		// compute filter options (departments) from existing certification records
		const recs = await prisma.certificationRecord.findMany({
			where: { companyId, status: { not: 'Archived' } },
			include: { employee: { select: { department: true } } },
			take: 2000,
		});
		const deptSet = new Set<string>();
		recs.forEach((r) => {
			if (r.employee?.department) deptSet.add(r.employee.department);
		});
		const filterOptions = { departments: Array.from(deptSet).sort() };

		return withCors(ApiResponse.success({ available: true, trendData, monthlyRows, filterOptions }), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
