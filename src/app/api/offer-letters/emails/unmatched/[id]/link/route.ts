// src/app/api/offer-letters/emails/unmatched/[id]/link/route.ts
//
// POST — SUPER_ADMIN manually attributes an imported Inbox message to a
// company. No offer-letter association is required at this stage.
import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const origin = request.headers.get('origin');
	try {
		const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		requireRole(token, ['SUPER_ADMIN']);
		const { id } = await params;

		const body = await request.json();
		const { companyId }: { companyId?: string } = body;
		if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin);

		const message = await prisma.offerLetterMailboxMessage.findUnique({ where: { id } });
		if (!message) return withCors(ApiResponse.error('Imported Inbox message not found', 404), origin);
		if (message.companyId) return withCors(ApiResponse.error('This message has already been assigned', 409), origin);

		const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
		if (!company) return withCors(ApiResponse.error('Company not found', 404), origin);

		const updated = await prisma.offerLetterMailboxMessage.update({ where: { id }, data: { companyId } });

		return withCors(ApiResponse.success(updated, `Message assigned to company ${companyId}.`), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
