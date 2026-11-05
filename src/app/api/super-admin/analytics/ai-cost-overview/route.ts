import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/super-admin/analytics/ai-cost-overview
// Platform-wide AI spend trend (last 30 days, bucketed by day in JS since
// Prisma groupBy can't date-trunc), top-spending companies, the currently
// active token rate, and recent email delivery health.
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		requireRole(token, ['SUPER_ADMIN']);

		const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

		const [recentUsage, topSpendRows, activeRate, failedEmails7d, totalEmails7d] = await Promise.all([
			(prisma as any).aIUsageLog.findMany({
				where: { createdAt: { gte: last30Days } },
				select: { createdAt: true, cost: true, tokensUsed: true },
			}),
			(prisma as any).aIUsageLog.groupBy({
				by: ['companyId'],
				_sum: { cost: true, tokensUsed: true },
				orderBy: { _sum: { cost: 'desc' } },
				take: 5,
			}),
			(prisma as any).tokenCostConfig.findFirst({ where: { isActive: true } }),
			(prisma as any).emailLog.count({ where: { status: 'FAILED', createdAt: { gte: last7Days } } }),
			(prisma as any).emailLog.count({ where: { createdAt: { gte: last7Days } } }),
		]);

		// Bucket by day (YYYY-MM-DD)
		const dailyMap = new Map<string, { cost: number; tokensUsed: number }>();
		for (const row of recentUsage) {
			const day = row.createdAt.toISOString().slice(0, 10);
			const bucket = dailyMap.get(day) ?? { cost: 0, tokensUsed: 0 };
			bucket.cost += row.cost ?? 0;
			bucket.tokensUsed += row.tokensUsed ?? 0;
			dailyMap.set(day, bucket);
		}
		const dailyTrend = Array.from(dailyMap.entries())
			.map(([day, v]) => ({ day, cost: Math.round(v.cost * 100) / 100, tokensUsed: v.tokensUsed }))
			.sort((a, b) => a.day.localeCompare(b.day));

		const companyIds = topSpendRows.map((r: any) => r.companyId);
		const companies = companyIds.length ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, companyName: true } }) : [];
		const companyNameById = new Map(companies.map((c: any) => [c.id, c.companyName]));

		const topSpenders = topSpendRows.map((r: any) => ({
			companyId: r.companyId,
			companyName: companyNameById.get(r.companyId) ?? 'Unknown',
			cost: Math.round((r._sum.cost ?? 0) * 100) / 100,
			tokensUsed: r._sum.tokensUsed ?? 0,
		}));

		return withCors(
			ApiResponse.success({
				dailyTrend,
				topSpenders,
				activeRate: activeRate
					? { costPerUnit: activeRate.costPerUnit, tokensPerUnit: activeRate.tokensPerUnit, currency: activeRate.currency }
					: null,
				emailHealth: {
					failedLast7d: failedEmails7d,
					totalLast7d: totalEmails7d,
					failureRate: totalEmails7d > 0 ? Math.round((failedEmails7d / totalEmails7d) * 100) : 0,
				},
			}),
			origin
		);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
