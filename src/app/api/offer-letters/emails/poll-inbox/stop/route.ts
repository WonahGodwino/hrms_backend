import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { requireModuleAccess } from '@/app/lib/module-access';
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access';
import { stopOfferLetterPoll } from '@/app/lib/offer-letters/email/pollControl';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

const ALL_COMPANIES_LOCK_KEY = '__ALL__';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const companyId = request.nextUrl.searchParams.get('companyId');

		if (!companyId) {
			const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
			requireRole(token, ['SUPER_ADMIN']);
			const stopped = stopOfferLetterPoll(ALL_COMPANIES_LOCK_KEY);
			return withCors(ApiResponse.success({ stopped }, stopped ? 'Inbox sync stop requested.' : 'No Inbox sync is running.'), origin);
		}

		const cronSecret = process.env.CRON_SECRET;
		const providedSecret = request.headers.get('x-cron-secret');
		const isCron = !!cronSecret && providedSecret === cronSecret;
		if (!isCron) {
			const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
			const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN']);
			const hasAccess = await validateOfferLetterCompanyAccess(user, companyId);
			if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);
		}

		const stopped = stopOfferLetterPoll(companyId);
		return withCors(ApiResponse.success({ stopped }, stopped ? 'Inbox sync stop requested.' : 'No Inbox sync is running.'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
