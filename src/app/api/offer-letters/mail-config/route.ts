// src/app/api/offer-letters/mail-config/route.ts
//
// GET/PUT — per-company Hostinger mailbox configuration (OfferLetterMailConfig).
// PUT test-connects with the submitted credentials (SMTP verify() + IMAP
// connect/noop) BEFORE persisting anything — a bad new mailbox (wrong
// password, IMAP disabled, wrong host) is rejected at save time instead of
// silently breaking the next send/poll.
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { NextRequest } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access';
import { invalidateOfferLetterMailConfigCache } from '@/app/lib/offer-letters/email/mailConfig';
import { invalidateOfferLetterSentFolderCache } from '@/app/lib/offer-letters/email/mailbox';
import { invalidateOfferLetterSmtpTransport } from '@/app/lib/offer-letters/email/transport';
import { ApiResponse, handleApiError } from '@/app/lib/utils';
import { decryptMailSecret, encryptMailSecret } from '@/app/lib/crypto/mailSecret';

const DEFAULT_SMTP_HOST = 'smtp.hostinger.com';
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_IMAP_HOST = 'imap.hostinger.com';
const DEFAULT_IMAP_PORT = 993;

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin);

		const companyId = request.nextUrl.searchParams.get('companyId');
		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin);

		const token = authHeader.replace('Bearer ', '');
		const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN']);
		const hasAccess = await validateOfferLetterCompanyAccess(user, companyId);
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);

		const row = await prisma.offerLetterMailConfig.findUnique({ where: { companyId } });
		if (!row) return withCors(ApiResponse.success({ configured: false }), origin);

		return withCors(
			ApiResponse.success({
				configured: true,
				fromName: row.fromName,
				smtpUser: row.smtpUser,
				smtpHost: row.smtpHost,
				smtpPort: row.smtpPort,
				imapUser: row.imapUser || row.smtpUser,
				imapHost: row.imapHost,
				imapPort: row.imapPort,
				isVerified: row.isVerified,
				lastVerifiedAt: row.lastVerifiedAt,
			}),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

export async function PUT(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin);

		const token = authHeader.replace('Bearer ', '');
		const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN']);

		const body = await request.json();
		const {
			companyId,
			fromName,
			smtpUser,
			smtpPassword,
			smtpHost,
			smtpPort,
			imapUser,
			imapPassword,
			imapHost,
			imapPort,
		}: {
			companyId?: string;
			fromName?: string;
			smtpUser?: string;
			smtpPassword?: string;
			smtpHost?: string;
			smtpPort?: number;
			imapUser?: string;
			imapPassword?: string;
			imapHost?: string;
			imapPort?: number;
		} = body;

		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin);
		if (!fromName?.trim()) return withCors(ApiResponse.error('A display name (e.g. "Support") is required', 400), origin);
		if (!smtpUser?.trim()) return withCors(ApiResponse.error('A mailbox email address is required', 400), origin);

		const hasAccess = await validateOfferLetterCompanyAccess(user, companyId);
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);

		const existing = await prisma.offerLetterMailConfig.findUnique({ where: { companyId } });

		// Password fields are optional on update — omitted means "keep what's
		// already saved". A brand-new config requires both.
		const resolvedSmtpPassword = smtpPassword?.trim() || (existing ? decryptMailSecret(existing.smtpPasswordEncrypted) : null);
		if (!resolvedSmtpPassword) return withCors(ApiResponse.error('A mailbox password is required', 400), origin);

		const resolvedImapUser = imapUser?.trim() || smtpUser.trim();
		const resolvedImapPassword =
			imapPassword?.trim() ||
			(existing?.imapPasswordEncrypted ? decryptMailSecret(existing.imapPasswordEncrypted) : null) ||
			resolvedSmtpPassword;

		const resolvedSmtpHost = smtpHost?.trim() || existing?.smtpHost || DEFAULT_SMTP_HOST;
		const resolvedSmtpPort = smtpPort || existing?.smtpPort || DEFAULT_SMTP_PORT;
		const resolvedImapHost = imapHost?.trim() || existing?.imapHost || DEFAULT_IMAP_HOST;
		const resolvedImapPort = imapPort || existing?.imapPort || DEFAULT_IMAP_PORT;

		// Test-connect with the proposed credentials before writing anything —
		// this is what catches a mistyped password or a mailbox with IMAP
		// disabled at save time instead of on the next real send/poll.
		const smtpTestTransport = nodemailer.createTransport({
			host: resolvedSmtpHost,
			port: resolvedSmtpPort,
			secure: resolvedSmtpPort === 465,
			auth: { user: smtpUser.trim(), pass: resolvedSmtpPassword },
		});
		try {
			await smtpTestTransport.verify();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return withCors(ApiResponse.error(`Could not verify SMTP login for ${smtpUser.trim()}: ${message}`, 400), origin);
		} finally {
			smtpTestTransport.close();
		}

		const imapTestClient = new ImapFlow({
			host: resolvedImapHost,
			port: resolvedImapPort,
			secure: resolvedImapPort === 993,
			auth: { user: resolvedImapUser, pass: resolvedImapPassword },
			logger: false,
			socketTimeout: 20000,
			greetingTimeout: 10000,
			connectionTimeout: 15000,
		});
		imapTestClient.on('error', () => {
			// Swallowed intentionally — the connect() call below already surfaces
			// the failure via its own rejection; without this listener Node
			// would treat the emitted 'error' event as an uncaught exception.
		});
		try {
			await imapTestClient.connect();
			await imapTestClient.noop();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return withCors(ApiResponse.error(`Could not verify IMAP login for ${resolvedImapUser}: ${message}`, 400), origin);
		} finally {
			try {
				await imapTestClient.logout();
			} catch {
				// Already disconnected; logout would just throw again.
			}
		}

		const data = {
			fromName: fromName.trim(),
			smtpHost: resolvedSmtpHost,
			smtpPort: resolvedSmtpPort,
			smtpSecure: resolvedSmtpPort === 465,
			smtpUser: smtpUser.trim(),
			smtpPasswordEncrypted: encryptMailSecret(resolvedSmtpPassword),
			imapHost: resolvedImapHost,
			imapPort: resolvedImapPort,
			imapUser: resolvedImapUser === smtpUser.trim() ? null : resolvedImapUser,
			imapPasswordEncrypted: resolvedImapPassword === resolvedSmtpPassword ? null : encryptMailSecret(resolvedImapPassword),
			isVerified: true,
			lastVerifiedAt: new Date(),
			updatedBy: user.userId,
		};

		await prisma.offerLetterMailConfig.upsert({
			where: { companyId },
			create: { companyId, ...data },
			update: data,
		});

		// Every cached connection/transport/folder-path for this company is now
		// stale (credentials and/or host may have changed) — drop them all so
		// the very next send/poll picks up what was just saved.
		invalidateOfferLetterMailConfigCache(companyId);
		invalidateOfferLetterSmtpTransport(companyId);
		invalidateOfferLetterSentFolderCache(companyId);

		return withCors(ApiResponse.success({ ok: true }, 'Mailbox verified and saved.'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}

// DELETE — removes this company's mailbox configuration entirely, leaving
// send/poll blocked (no shared/global fallback) until someone re-enters
// credentials via PUT. Does not touch already-sent/imported email history
// (OfferLetterEmail / OfferLetterMailboxMessage rows) — only the credentials
// row itself.
export async function DELETE(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin);

		const companyId = request.nextUrl.searchParams.get('companyId');
		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin);

		const token = authHeader.replace('Bearer ', '');
		const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN']);
		const hasAccess = await validateOfferLetterCompanyAccess(user, companyId);
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);

		const existing = await prisma.offerLetterMailConfig.findUnique({ where: { companyId } });
		if (!existing) return withCors(ApiResponse.success({ ok: true }, 'No mailbox was configured for this company.'), origin);

		await prisma.offerLetterMailConfig.delete({ where: { companyId } });

		// Drop every cached connection/transport/folder-path for this company —
		// otherwise a stale in-memory client could keep "working" against the
		// now-deleted credentials until the process restarts.
		invalidateOfferLetterMailConfigCache(companyId);
		invalidateOfferLetterSmtpTransport(companyId);
		invalidateOfferLetterSentFolderCache(companyId);

		return withCors(ApiResponse.success({ ok: true }, 'Mailbox configuration deleted.'), origin);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
