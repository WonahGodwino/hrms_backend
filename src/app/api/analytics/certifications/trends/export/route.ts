import { NextRequest } from 'next/server';

import { getCorsHeaders, handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/analytics/certifications/trends/export?companyId=&period=6m&department=
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

		// reuse same month window logic as trends
		const now = new Date();
		let months: number;
		let ytd = false;
		if (period === 'ytd') {
			months = now.getMonth() + 1;
			ytd = true;
		} else if (period.endsWith('m')) months = Math.min(12, parseInt(period.replace('m', ''), 10) || 6);
		else months = 6;

		const rows: any[] = [];
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
			const whereBase: any = { companyId, status: { not: 'Archived' }, issueDate: { lte: end }, OR: [{ expiryDate: null }, { expiryDate: { gte: start } }] };
			if (department) whereBase.employee = { department };

			const [total, compliant] = await Promise.all([
				prisma.certificationRecord.count({ where: whereBase }),
				prisma.certificationRecord.count({ where: { ...whereBase, status: 'Valid' } }),
			]);

			const riskCount = Math.max(0, total - compliant);
			const score = total > 0 ? Math.round((compliant / total) * 100) : 0;

			rows.push({ month: monthLabel, total, compliantCount: compliant, riskCount, score });
		}

		// Build CSV
		const header = ['month', 'total', 'compliantCount', 'riskCount', 'score'];
		const csv = [header.join(',')].concat(rows.map((r) => [r.month, r.total, r.compliantCount, r.riskCount, r.score].join(','))).join('\n');

		const corsHeaders = getCorsHeaders(origin);
		return new Response(csv, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': 'attachment; filename="certification_trends.csv"',
				...corsHeaders,
			},
		});
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}

// no-op: using centralized getCorsHeaders from lib/cors
