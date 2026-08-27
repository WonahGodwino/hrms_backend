// src/app/api/offer-letters/emails/poll-inbox/route.ts
//
// POST — checks a Hostinger mailbox's INBOX for unseen replies and mirrors
// them into the system. Two modes:
//  - ?companyId=<id>: polls that one company's own mailbox. Used by the
//    per-company Inbox/thread views (HR/ADMIN, or the cron trigger below).
//  - no companyId: polls every configured company's mailbox in turn,
//    feeding the cross-company "unassigned" triage queue
//    (GET /offer-letters/emails/unmatched) with whatever didn't match a
//    known outbound Message-ID in any of them.
// Two ways to authenticate EITHER form, mirroring
// backend/src/app/api/recruitment/offers/expire-lapsed/route.ts:
//  1. An external cron job (e.g. cron-job.org): header
//     `x-cron-secret: <process.env.CRON_SECRET>` — this is how the
//     cross-company sweep runs automatically on a timer with nobody
//     watching a spinner, so it uses a larger per-run budget than a manual
//     click (see CRON_REQUEST_BUDGET in inboundPoll.ts).
//  2. An authenticated user, for manual triggering (SUPER_ADMIN only for
//     the cross-company form; HR/ADMIN/SUPER_ADMIN with company access for
//     the per-company form).
import { NextRequest } from 'next/server';

import { requireRole } from '@/app/lib/auth';
import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { requireModuleAccess } from '@/app/lib/module-access';
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access';
import { pollAllOfferLetterMailboxes, pollOfferLetterInbox } from '@/app/lib/offer-letters/email/inboundPoll';
import { beginOfferLetterPoll, endOfferLetterPoll } from '@/app/lib/offer-letters/email/pollControl';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

const ALL_COMPANIES_LOCK_KEY = '__ALL__';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const companyId = request.nextUrl.searchParams.get('companyId');

		const cronSecret = process.env.CRON_SECRET;
		const providedSecret = request.headers.get('x-cron-secret');
		const isCron = !!cronSecret && providedSecret === cronSecret;

		if (!companyId) {
			// Cross-company scan — cron-secret OR an authenticated SUPER_ADMIN.
			if (!isCron) {
				const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
				requireRole(token, ['SUPER_ADMIN']);
			}

			const signal = beginOfferLetterPoll(ALL_COMPANIES_LOCK_KEY);
			if (!signal) return withCors(ApiResponse.error('An Inbox sync is already running', 409), origin);

			try {
				const result = await pollAllOfferLetterMailboxes(signal, isCron);
				return withCors(ApiResponse.success(result, buildResultMessage(result)), origin);
			} finally {
				endOfferLetterPoll(ALL_COMPANIES_LOCK_KEY);
			}
		}

		if (!isCron) {
			const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
			const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN']);
			const hasAccess = await validateOfferLetterCompanyAccess(user, companyId);
			if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);
		}

		const signal = beginOfferLetterPoll(companyId);
		if (!signal) return withCors(ApiResponse.error('An Inbox sync is already running', 409), origin);

		try {
			const result = await pollOfferLetterInbox(companyId, signal, isCron);

			const hasErrors = result.errors.length > 0;
			const message = buildResultMessage(result);

			// A connection/auth failure is a real problem, not a transient
			// "nothing found yet" — respond non-2xx so the frontend's retry
			// loop stops and shows the actual reason instead of looping
			// silently against a mailbox it can never reach.
			return withCors(hasErrors ? ApiResponse.error(message, 502, result.errors) : ApiResponse.success(result, message), origin);
		} finally {
			endOfferLetterPoll(companyId);
		}
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

function buildResultMessage(result: { stopped: boolean; scanned: number; imported: number; matched: number; unmatched: number; hasMore: boolean; errors: string[] }) {
	const hasErrors = result.errors.length > 0;
	return `${result.stopped ? 'Stopped. ' : ''}Scanned ${result.scanned}, imported ${result.imported}, matched ${result.matched}, unmatched ${result.unmatched}.${
		result.hasMore ? ' More mail waiting — call again to continue.' : ''
	}${hasErrors ? ` Sync error: ${result.errors.join(' | ')}` : ''}`;
}
