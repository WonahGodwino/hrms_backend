// scripts/seedOfferLetterMailConfig.ts
//
// One-off migration helper: per-company mail config (OfferLetterMailConfig)
// is now required for offer-letter send/poll to work — there is no more
// shared/global mailbox fallback. This inserts a config row for whichever
// company is already using the module today, populated from the *current*
// OFFER_LETTER_SMTP_*/OFFER_LETTER_IMAP_* env values, so that company keeps
// working unchanged the moment this ships. Every other/new company must be
// configured separately via the Mailbox tab in Offer Letter Settings.
//
// Usage: npx tsx scripts/seedOfferLetterMailConfig.ts <companyId>
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
	const companyId = process.argv[2];
	if (!companyId) {
		console.error('Usage: npx tsx scripts/seedOfferLetterMailConfig.ts <companyId>');
		process.exit(1);
	}

	// Imported after dotenv.config() so OFFER_LETTER_MAIL_CONFIG_KEY/DATABASE_URL
	// are already in process.env by the time these modules read them.
	const { prisma } = await import('../src/app/lib/db');
	const { encryptMailSecret } = await import('../src/app/lib/crypto/mailSecret');

	const {
		OFFER_LETTER_SMTP_HOST,
		OFFER_LETTER_SMTP_PORT,
		OFFER_LETTER_SMTP_USER,
		OFFER_LETTER_SMTP_PASSWORD,
		OFFER_LETTER_IMAP_HOST,
		OFFER_LETTER_IMAP_PORT,
		OFFER_LETTER_IMAP_USER,
		OFFER_LETTER_IMAP_PASSWORD,
	} = process.env;

	if (!OFFER_LETTER_SMTP_USER || !OFFER_LETTER_SMTP_PASSWORD || !OFFER_LETTER_IMAP_USER || !OFFER_LETTER_IMAP_PASSWORD) {
		console.error('OFFER_LETTER_SMTP_*/OFFER_LETTER_IMAP_* env vars are not fully set — nothing to seed from.');
		process.exit(1);
	}

	const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, companyName: true } });
	if (!company) {
		console.error(`No company found with id "${companyId}".`);
		process.exit(1);
	}

	const smtpPort = parseInt(OFFER_LETTER_SMTP_PORT || '465', 10);
	const imapPort = parseInt(OFFER_LETTER_IMAP_PORT || '993', 10);
	const sameCreds = OFFER_LETTER_IMAP_USER === OFFER_LETTER_SMTP_USER && OFFER_LETTER_IMAP_PASSWORD === OFFER_LETTER_SMTP_PASSWORD;

	await prisma.offerLetterMailConfig.upsert({
		where: { companyId },
		create: {
			companyId,
			fromName: 'iSurf Global HR',
			smtpHost: OFFER_LETTER_SMTP_HOST || 'smtp.hostinger.com',
			smtpPort,
			smtpSecure: smtpPort === 465,
			smtpUser: OFFER_LETTER_SMTP_USER,
			smtpPasswordEncrypted: encryptMailSecret(OFFER_LETTER_SMTP_PASSWORD),
			imapHost: OFFER_LETTER_IMAP_HOST || 'imap.hostinger.com',
			imapPort,
			imapUser: sameCreds ? null : OFFER_LETTER_IMAP_USER,
			imapPasswordEncrypted: sameCreds ? null : encryptMailSecret(OFFER_LETTER_IMAP_PASSWORD),
			isVerified: false, // unverified until someone hits Test & Save in the UI once
			updatedBy: 'seed-script',
		},
		update: {},
	});

	console.log(`Seeded OfferLetterMailConfig for "${company.companyName}" (${company.id}) from env vars.`);
	await prisma.$disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
