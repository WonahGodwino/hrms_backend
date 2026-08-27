// src/app/api/offer-letters/emails/[emailId]/read/route.ts
import { NextRequest } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin);

		const token = authHeader.replace('Bearer ', '');
		const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN']);
		const { emailId } = await params;

		const email = await prisma.offerLetterEmail.findUnique({ where: { id: emailId }, select: { companyId: true } });
		if (email) {
			const hasAccess = await validateOfferLetterCompanyAccess(user, email.companyId);
			if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);

			const updated = await prisma.offerLetterEmail.update({ where: { id: emailId }, data: { isRead: true } });
			return withCors(ApiResponse.success(updated, 'Marked as read'), origin);
		}

		const staged = await prisma.offerLetterMailboxMessage.findUnique({ where: { id: emailId }, select: { companyId: true } });
		if (!staged?.companyId) return withCors(ApiResponse.error('Email not found', 404), origin);
		const hasAccess = await validateOfferLetterCompanyAccess(user, staged.companyId);
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);

		const updated = await prisma.offerLetterMailboxMessage.update({ where: { id: emailId }, data: { isRead: true } });
		return withCors(ApiResponse.success(updated, 'Marked as read'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
