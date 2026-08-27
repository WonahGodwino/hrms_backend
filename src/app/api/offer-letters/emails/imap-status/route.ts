// src/app/api/offer-letters/emails/imap-status/route.ts
//
// GET — pure connectivity diagnostic for the Hostinger IMAP mailbox: just
// connect → noop → logout, no fetching or DB writes. Exists to answer
// "can this server's Node/ImapFlow client actually reach and authenticate
// against the mailbox" independently of poll-inbox's batching/import logic,
// since a working `telnet host 993` or a working Outlook profile with the
// same credentials does NOT prove the same for a TLS-strict Node client
// (e.g. certificate hostname/chain issues that other clients tolerate).
import { NextRequest } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { requireModuleAccess } from '@/app/lib/module-access';
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access';
import { createOfferLetterImapClient, getOfferLetterImapConfig } from '@/app/lib/offer-letters/email/mailbox';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const companyId = request.nextUrl.searchParams.get('companyId');
		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin);

		const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
		const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN']);
		const hasAccess = await validateOfferLetterCompanyAccess(user, companyId);
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);

		const config = await getOfferLetterImapConfig(companyId);
		const client = await createOfferLetterImapClient(companyId);

		const startedAt = Date.now();
		try {
			await client.connect();
			await client.noop();
			const mailboxes = await client.list();
			const durationMs = Date.now() - startedAt;

			return withCors(
				ApiResponse.success(
					{
						ok: true,
						host: config.host,
						port: config.port,
						secure: config.secure,
						user: config.auth.user,
						durationMs,
						folders: mailboxes.map((mailbox) => ({ path: mailbox.path, specialUse: mailbox.specialUse || null })),
					},
					`Connected to ${config.host}:${config.port} in ${durationMs}ms.`
				),
				origin
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			// Surface the raw driver error (TLS handshake failure, auth
			// rejection, ECONNREFUSED, etc) — this IS the diagnostic value of
			// the endpoint, so it must not be swallowed like the poll path
			// historically was.
			return withCors(
				ApiResponse.error(`Could not connect to ${config.host}:${config.port} as ${config.auth.user}: ${message}`, 502, [message]),
				origin
			);
		} finally {
			try {
				await client.logout();
			} catch {
				// Already disconnected; logout would just throw again.
			}
		}
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
