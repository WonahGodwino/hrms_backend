// src/app/lib/offer-letters/email/mailConfig.ts
//
// Resolves the per-company Hostinger mailbox configuration that every other
// file in this directory (transport.ts, mailbox.ts, inboundPoll.ts,
// sendEmail.ts) now requires instead of reading OFFER_LETTER_SMTP_*/
// OFFER_LETTER_IMAP_* env vars directly. There is no shared/global mailbox
// fallback — a company with no OfferLetterMailConfig row simply cannot send
// or receive offer-letter email until one is configured (see the Mailbox
// tab under Company Offer Letter Settings).
import { prisma } from '@/app/lib/db';

import { decryptMailSecret, encryptMailSecret } from '../../crypto/mailSecret';

export interface ResolvedOfferLetterMailConfig {
	fromName: string;
	smtpHost: string;
	smtpPort: number;
	smtpSecure: boolean;
	smtpUser: string;
	smtpPassword: string;
	imapHost: string;
	imapPort: number;
	imapUser: string;
	imapPassword: string;
}

const cache = new Map<string, ResolvedOfferLetterMailConfig>();

export function invalidateOfferLetterMailConfigCache(companyId: string) {
	cache.delete(companyId);
}

export async function getOfferLetterMailConfig(companyId: string): Promise<ResolvedOfferLetterMailConfig> {
	const cached = cache.get(companyId);
	if (cached) return cached;

	const row = await prisma.offerLetterMailConfig.findUnique({ where: { companyId } });
	if (!row) {
		throw new Error('No mailbox is configured for this company yet. Set one up under Offer Letter Settings → Mailbox.');
	}

	const resolved: ResolvedOfferLetterMailConfig = {
		fromName: row.fromName,
		smtpHost: row.smtpHost,
		smtpPort: row.smtpPort,
		smtpSecure: row.smtpSecure,
		smtpUser: row.smtpUser,
		smtpPassword: decryptMailSecret(row.smtpPasswordEncrypted),
		imapHost: row.imapHost,
		imapPort: row.imapPort,
		imapUser: row.imapUser || row.smtpUser,
		imapPassword: row.imapPasswordEncrypted ? decryptMailSecret(row.imapPasswordEncrypted) : decryptMailSecret(row.smtpPasswordEncrypted),
	};

	cache.set(companyId, resolved);
	return resolved;
}

export { encryptMailSecret };
