import { ImapFlow } from 'imapflow';

import { getOfferLetterMailConfig } from './mailConfig';

export async function getOfferLetterImapConfig(companyId: string) {
	const config = await getOfferLetterMailConfig(companyId);

	return {
		host: config.imapHost,
		port: config.imapPort,
		secure: config.imapPort === 993,
		auth: { user: config.imapUser, pass: config.imapPassword },
		// ImapFlow's default socketTimeout is 300000ms (5 minutes) — a stalled
		// connection (no response from Hostinger) would hang the entire request
		// for that long before failing, which is exactly what happened. Fail
		// fast instead: a real IMAP round trip completes in well under this.
		// 45s (not the original 20s) gives real headroom for the metadata scan
		// in inboundPoll.ts, which — even bounded to MAX_SCAN_WINDOW messages —
		// is still slower than a simple command/response round trip.
		socketTimeout: 45000,
		greetingTimeout: 10000,
		connectionTimeout: 15000,
	};
}

export async function createOfferLetterImapClient(companyId: string) {
	const client = new ImapFlow({ ...(await getOfferLetterImapConfig(companyId)), logger: false });
	// ImapFlow extends EventEmitter and emits 'error' on socket/protocol
	// failures (e.g. a timeout). With no listener attached, Node treats that
	// as an unhandled 'error' event — which throws as an UNCAUGHT EXCEPTION
	// at the process level, completely bypassing any try/catch around the
	// await chain using this client (this is why the previous try/catch
	// around the fetch loop didn't actually catch the socket timeout). This
	// listener is required on every client this factory produces.
	client.on('error', (err: Error) => {
		console.error(`[OFFER_LETTER_IMAP] Client error (company ${companyId}):`, err?.message || err);
	});
	return client;
}

// Keyed by companyId — a single shared cache would leak one company's
// mailbox's Sent-folder path onto another company's connection now that
// every company has its own physical mailbox.
const sentFolderPathByCompany = new Map<string, string>();

export function invalidateOfferLetterSentFolderCache(companyId: string) {
	sentFolderPathByCompany.delete(companyId);
}

// Hostinger (and most cPanel/Dovecot-provisioned mailboxes) nest special
// folders under INBOX — the real path is "INBOX.Sent", not "Sent". Never
// hardcode the folder name: discover it via the IMAP SPECIAL-USE flag
// (RFC 6154), which is why this was broken before — appending to a literal
// "Sent" mailbox that doesn't exist failed silently (the error was only
// console.error'd, never surfaced), so sent mail never appeared in Hostinger's
// actual Sent folder even though the SMTP send itself succeeded.
export async function resolveSentFolderPath(client: InstanceType<typeof ImapFlow>): Promise<string> {
	const mailboxes = await client.list()
	const bySpecialUse = mailboxes.find((mailbox) => mailbox.specialUse === '\\Sent')
	if (bySpecialUse) return bySpecialUse.path

	const commonNames = ['INBOX.Sent', 'Sent', 'Sent Items', 'INBOX.Sent Items']
	const byName = mailboxes.find((mailbox) => commonNames.includes(mailbox.path))
	if (byName) return byName.path

	throw new Error('Could not locate a Sent folder on this mailbox (no \\Sent special-use flag and no common name match).')
}

export async function appendOfferLetterToSent(rawMessage: Buffer, companyId: string) {
	const client = await createOfferLetterImapClient(companyId)
	await client.connect()
	try {
		const sentPath = await resolveSentFolderPath(client)
		sentFolderPathByCompany.set(companyId, sentPath)
		await client.append(sentPath, rawMessage, ['\\Seen'])
	} finally {
		await client.logout()
	}
}
