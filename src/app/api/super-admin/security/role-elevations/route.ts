import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(req: NextRequest) {
	return handleCorsOptions(req);
}

// GET /api/super-admin/security/role-elevations
// Currently-active privileged access grants, for the dashboard's Security
// & Access widget. Flags grants whose expiresAt has already passed but
// whose status hasn't been transitioned to EXPIRED yet.
export async function GET(req: NextRequest) {
	const origin = req.headers.get('origin');
	try {
		const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		requireRole(token, ['SUPER_ADMIN']);

		const now = new Date();

		const elevations = await (prisma as any).roleElevation.findMany({
			where: { status: 'ACTIVE' },
			orderBy: { expiresAt: 'asc' },
			take: 25,
			include: {
				staff: { select: { firstName: true, lastName: true } },
				company: { select: { companyName: true } },
			},
		});

		const items = elevations.map((e: any) => ({
			id: e.id,
			staffName: `${e.staff?.firstName ?? ''} ${e.staff?.lastName ?? ''}`.trim(),
			companyName: e.company?.companyName ?? 'N/A',
			fromRole: e.fromRole,
			toRole: e.toRole,
			grantedByName: e.grantedByName,
			expiresAt: e.expiresAt,
			isStale: !!e.expiresAt && e.expiresAt < now,
			createdAt: e.createdAt,
		}));

		return withCors(
			ApiResponse.success({
				items,
				staleCount: items.filter((i: any) => i.isStale).length,
			}),
			origin
		);
	} catch (e) {
		return withCors(handleApiError(e), origin);
	}
}
