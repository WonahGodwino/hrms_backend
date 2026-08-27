// src/app/api/offer-letters/emails/unmatched/route.ts
//
// GET — SUPER_ADMIN-only triage queue for imported Inbox messages that are not
// yet assigned to a company. Never exposed to per-company HR views.
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
		const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		requireRole(token, ['SUPER_ADMIN']);

		const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1', 10));
		const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)));
		const search = request.nextUrl.searchParams.get('search')?.trim();

		const where: any = { companyId: null };
		if (search) {
			where.OR = [{ fromEmail: { contains: search, mode: 'insensitive' } }, { subject: { contains: search, mode: 'insensitive' } }];
		}

		const [items, total] = await Promise.all([
			prisma.offerLetterMailboxMessage.findMany({
				where,
				include: { attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true } } },
				orderBy: { receivedAt: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
			}),
			prisma.offerLetterMailboxMessage.count({ where }),
		]);

		return withCors(
			ApiResponse.success({
				items,
				pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
			}),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
