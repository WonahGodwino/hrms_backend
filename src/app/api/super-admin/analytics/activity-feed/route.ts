import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

type FeedItem = {
	type: 'STAFF_ACTIVITY' | 'ROLE_ELEVATION' | 'APPROVAL_ACTION' | 'COMPANY_ONBOARDED';
	message: string;
	actorName: string | null;
	companyName: string | null;
	occurredAt: Date;
};

// GET /api/super-admin/analytics/activity-feed
// A merged, capped, best-effort "what's happening on the platform" feed.
// Federated read across fragmented per-module logs, NOT a unified audit
// table. Not suitable as a compliance/legal audit trail; for that, read the
// specific source tables directly.
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		requireRole(token, ['SUPER_ADMIN']);

		const [staffActivity, roleElevations, approvalActions, newCompanies] = await Promise.all([
			(prisma as any).staffActivityLog.findMany({
				orderBy: { createdAt: 'desc' },
				take: 25,
				include: { company: { select: { companyName: true } } },
			}),
			(prisma as any).roleElevation.findMany({
				orderBy: { createdAt: 'desc' },
				take: 25,
				include: { company: { select: { companyName: true } } },
			}),
			(prisma as any).approvalActionLog.findMany({
				orderBy: { createdAt: 'desc' },
				take: 25,
			}),
			prisma.company.findMany({
				orderBy: { createdAt: 'desc' },
				take: 25,
				select: { companyName: true, createdAt: true },
			}),
		]);

		const items: FeedItem[] = [
			...staffActivity.map((log: any) => ({
				type: 'STAFF_ACTIVITY' as const,
				message: `${log.performedByName}: ${log.action.replace(/_/g, ' ').toLowerCase()}`,
				actorName: log.performedByName,
				companyName: log.company?.companyName ?? null,
				occurredAt: log.createdAt,
			})),
			...roleElevations.map((e: any) => ({
				type: 'ROLE_ELEVATION' as const,
				message: e.status === 'ACTIVE' ? `${e.grantedByName ?? 'Someone'} elevated a staff member to ${e.toRole}` : `Role elevation to ${e.toRole} ${e.status.toLowerCase()}`,
				actorName: e.grantedByName ?? null,
				companyName: e.company?.companyName ?? null,
				occurredAt: e.createdAt,
			})),
			...approvalActions.map((a: any) => ({
				type: 'APPROVAL_ACTION' as const,
				message: `${a.actorName} ${a.action.toLowerCase().replace(/_/g, ' ')} a ${a.requestType.toLowerCase().replace(/_/g, ' ')} request`,
				actorName: a.actorName,
				companyName: null,
				occurredAt: a.createdAt,
			})),
			...newCompanies.map((c: any) => ({
				type: 'COMPANY_ONBOARDED' as const,
				message: `${c.companyName} onboarded to the platform`,
				actorName: null,
				companyName: c.companyName,
				occurredAt: c.createdAt,
			})),
		];

		items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

		return withCors(ApiResponse.success({ items: items.slice(0, 100) }), origin);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
