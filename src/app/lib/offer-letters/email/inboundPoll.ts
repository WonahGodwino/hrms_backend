// src/app/lib/offer-letters/email/inboundPoll.ts
//
// Imports one company's own Hostinger mailbox INBOX only — Sent-folder
// scanning was removed entirely: the Sent tab is already populated at send
// time by sendEmail.ts writing an OfferLetterEmail row, and the Sent
// mailbox is archived into unconditionally by appendOfferLetterToSent, so
// there was nothing left for an inbound Sent-folder scan to catch.
//
// Two ways a reply gets attributed to a specific letter/company, tried in
// order:
//  1. In-Reply-To/References matching a Message-ID we generated at send
//     time — unambiguous when present, but some relays/webmail clients
//     strip these headers in transit.
//  2. A short reference token embedded as an invisible HTML comment below
//     the signature of every outbound email (see sendEmail.ts). Survives
//     header-stripping because it travels in the body, in the part of the
//     message a replying client almost always quotes verbatim.
// Anything that matches neither still lands in the cross-company
// "unassigned" pool (companyId left null) for SUPER_ADMIN to triage via
// /offer-letters/emails/unmatched: connecting a company's mailbox for the
// first time typically pulls in mail that predates this system entirely
// (nothing we ever sent, so nothing to match against), and that backlog
// needs a human decision before it's dumped into an HR inbox, not an
// automatic company assignment just because it happened to arrive in that
// company's mailbox.
//
// Design goal (deliberate): one interactive call = ONE IMAP connection +
// up to REQUEST_BUDGET new messages, then return. It does NOT drain the
// whole backlog in one click. The frontend shows a count and, if
// `hasMore`, invites another click. Draining hundreds of messages on one
// click (via a client-side while(hasMore) loop, plus a second IMAP
// connection per folder) is exactly what made this feel slow and unstable
// before. The automatic cron trigger (see poll-inbox/route.ts) uses a
// larger CRON_REQUEST_BUDGET instead, since nobody is watching a spinner
// on a scheduled job — this is what lets a large backlog steadily drain
// between ticks instead of being perpetually starved by newer mail.
import { createHash } from 'crypto';
import { simpleParser } from 'mailparser';

import { prisma } from '@/app/lib/db';

import { isAbortedError, raceWithAbort } from './abortUtil';
import { getOfferLetterMailConfig } from './mailConfig';
import { createOfferLetterImapClient } from './mailbox';

function normalizeReferences(refs: string | string[] | undefined): string[] {
	if (!refs) return [];
	return Array.isArray(refs) ? refs : refs.split(/\s+/).filter(Boolean);
}

function normalizeAddresses(value: any): string[] {
	const addresses = Array.isArray(value) ? value : value?.value || [];
	return addresses.map((address: any) => address.address).filter(Boolean);
}

// Extracts the invisible `<!-- ref:xxxxxxxxxxxx -->` comment sendEmail.ts
// embeds below the signature of every outbound message. Only ever present
// in `parsed.html` (comments don't survive a plain-text-only body), but a
// client that flattened the quoted original to plain text is checked too
// on the off chance the raw marker text survived verbatim.
function extractRefToken(parsed: { html?: string | false; text?: string }): string | null {
	const haystack = (parsed.html || '') + (parsed.text || '');
	const match = haystack.match(/<!--\s*ref:([a-f0-9]{12})\s*-->/i);
	return match ? match[1].toLowerCase() : null;
}

export interface PollResult {
	scanned: number;
	imported: number;
	matched: number;
	unmatched: number;
	stopped: boolean;
	// True if the mailbox still has new messages beyond the ones this call
	// processed — the caller (or the user, via another click) can call again
	// to continue from the next UID. NOT auto-looped anywhere.
	hasMore: boolean;
	// Populated when a folder never actually connected/opened (auth failure,
	// TLS failure, network failure, etc). Distinct from hasMore: a failed
	// connection is not "more mail waiting", it's a real problem the caller
	// needs to see and stop retrying on.
	errors: string[];
}

// Interactive (button-click) budget — small on purpose: one click stays
// snappy and the socket is never held open long enough to hit Hostinger's
// idle/session timeout.
const REQUEST_BUDGET = 15;

// Automatic (cron-job.org) budget — nobody is watching a spinner, so this
// can afford to process more per tick. Running every ~3 minutes at this
// size drains a real backlog within a couple of hours while still keeping
// up with new mail as it arrives.
const CRON_REQUEST_BUDGET = 50;

// Upper bound (by sequence number, not UID) on how much of the mailbox the
// cheap metadata pass ever walks per call, regardless of REQUEST_BUDGET vs
// CRON_REQUEST_BUDGET — see the comment at its use site in processFolder.
const MAX_SCAN_WINDOW = 5000;

interface FolderOutcome {
	scanned: number;
	imported: number;
	matched: number;
	unmatched: number;
	hasMore: boolean;
	error: string | null;
}

// Processes up to `budget` new messages from INBOX on an ALREADY CONNECTED
// client. Returns how many were handled plus whether the folder still had
// more beyond the budget. Throws only on a genuine connection/protocol
// drop.
async function processFolder(
	client: Awaited<ReturnType<typeof createOfferLetterImapClient>>,
	companyId: string,
	ourAddress: string,
	budget: number,
	signal?: AbortSignal
): Promise<FolderOutcome> {
	const folderPath = 'INBOX';
	const outcome: FolderOutcome = { scanned: 0, imported: 0, matched: 0, unmatched: 0, hasMore: false, error: null };
	if (budget <= 0 || signal?.aborted) return outcome;

	const lock = await client.getMailboxLock(folderPath);
	try {
		if (!client.mailbox || (client.mailbox as any).exists === 0) return outcome;

		// Company+folder scoped: which UIDs have we already staged? UIDs are
		// only unique within one mailbox account, so with every company on its
		// own physical mailbox, this has to be scoped per company+folder rather
		// than a single global watermark.
		const staged = await prisma.offerLetterMailboxMessage.findMany({
			where: { companyId, folder: folderPath },
			select: { uid: true },
		});
		const knownUids = new Set(staged.map((row) => row.uid));

		// Step 1 — cheap metadata pass (no bodies yet), bounded to the most
		// recent MAX_SCAN_WINDOW messages by SEQUENCE number (not UID) rather
		// than the whole folder. A mailbox with a large pre-existing backlog
		// (the common case — see file header) made a `1:*` UID sweep of the
		// ENTIRE mailbox take longer than the IMAP socket timeout, killing the
		// connection before a single message got processed: 0 scanned, every
		// call reporting "more waiting" forever. Sequence numbers are always
		// 1..exists in mailbox order regardless of UID values, so this bounds
		// the walk to a constant size no matter how large the mailbox is.
		// Newest-first: an HR/ADMIN clicking the button wants today's mail
		// visible right away, not blocked behind however much older backlog is
		// still unprocessed — so we sort by UID descending (recency proxy) and
		// take the newest `budget` messages the company hasn't seen yet. The
		// automatic cron trigger uses a larger budget (not a different order),
		// which is what lets backlog within the scan window drain over
		// successive ticks without delaying fresh mail. Backlog older than the
		// scan window is never reached automatically — a real limit, but a far
		// better failure mode than every poll timing out and processing zero
		// messages including brand-new mail.
		const totalMessages = (client.mailbox as any).exists || 0;
		const startSeq = Math.max(1, totalMessages - MAX_SCAN_WINDOW + 1);
		const allUids: number[] = [];
		for await (const meta of client.fetch(`${startSeq}:*`, { uid: true })) {
			if (meta?.uid) allUids.push(meta.uid);
		}
		const pendingUids = allUids.filter((uid) => !knownUids.has(String(uid))).sort((a, b) => b - a);

		if (pendingUids.length === 0) return outcome;

		const selected = pendingUids.slice(0, budget);
		if (pendingUids.length > selected.length) outcome.hasMore = true;

		// Step 2 — download source ONLY for the selected UIDs (bounded, ≤budget).
		for await (const fetched of client.fetch(selected.join(','), { source: true, uid: true }, { uid: true })) {
			if (signal?.aborted) break;
			if (!fetched || !fetched.source) continue;
			const uid = fetched.uid;
			outcome.scanned++;

			const parsed = await simpleParser(fetched.source);
			const fingerprint = createHash('sha256').update(fetched.source).digest('hex');
			const messageId = parsed.messageId?.trim() || `<imap-${fingerprint}@local>`;

			const alreadyStaged = await prisma.offerLetterMailboxMessage.findUnique({ where: { fingerprint } });
			const alreadyImported = await prisma.offerLetterEmail.findFirst({ where: { messageId, companyId } });
			const alreadyUnmatched = await prisma.offerLetterUnmatchedReply.findFirst({ where: { messageId } });
			if (alreadyStaged || alreadyImported || alreadyUnmatched) {
				await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
				continue;
			}

			const inReplyTo = (parsed.inReplyTo || '').trim() || null;
			const references = normalizeReferences(parsed.references as any);
			const candidateMessageIds = [inReplyTo, ...references].filter(Boolean) as string[];

			let matchedEmail = candidateMessageIds.length
				? await prisma.offerLetterEmail.findFirst({
						where: { messageId: { in: candidateMessageIds }, direction: 'OUTBOUND', companyId },
				  })
				: null;

			// Fallback: In-Reply-To/References got stripped somewhere in
			// transit. Look for the invisible reference comment sendEmail.ts
			// embeds below the signature of every outbound message instead.
			if (!matchedEmail) {
				const refToken = extractRefToken(parsed);
				if (refToken) {
					const letter = await prisma.generatedOfferLetter.findFirst({ where: { id: { startsWith: refToken } } });
					// Defensive: only trust the token if it resolves to a letter
					// that actually belongs to the mailbox we're scanning.
					if (letter && letter.companyId === companyId) {
						matchedEmail = await prisma.offerLetterEmail.findFirst({
							where: { letterId: letter.id, direction: 'OUTBOUND', companyId },
							orderBy: { sentAt: 'desc' },
						});
					}
				}
			}

			const fromAddr = parsed.from?.value?.[0];
			const fromEmail = fromAddr?.address || 'unknown@unknown';
			const fromName = fromAddr?.name || fromEmail;
			const subject = parsed.subject || '(no subject)';
			const body = parsed.html || parsed.textAsHtml || parsed.text || '';
			const receivedAt = parsed.date || new Date();
			const toEmails = normalizeAddresses(parsed.to);
			const ccEmails = normalizeAddresses(parsed.cc);
			const rawHeaders = {
				headers: Object.fromEntries(Array.from(parsed.headers.entries()).map(([key, value]) => [key, String(value)])),
				attachmentNames: (parsed.attachments || []).map((attachment) => attachment.filename || 'attachment'),
			};

			// Direction reflects who actually sent it (the From address), not
			// which folder it was found in — relevant for the rare case of a
			// staff member manually CC'ing/forwarding through the same mailbox.
			const direction: 'INBOUND' | 'OUTBOUND' = ourAddress && fromEmail.toLowerCase() === ourAddress ? 'OUTBOUND' : 'INBOUND';

			if (matchedEmail) {
				const created = await prisma.offerLetterEmail.create({
					data: {
						companyId,
						letterId: matchedEmail.letterId,
						direction,
						fromEmail,
						fromName,
						toEmail: direction === 'OUTBOUND' ? toEmails[0] || matchedEmail.toEmail : matchedEmail.fromEmail,
						toName: direction === 'OUTBOUND' ? toEmails[0] || matchedEmail.toName : matchedEmail.fromName,
						subject,
						body,
						status: 'SENT',
						messageId,
						inReplyTo: inReplyTo || references[0] || null,
						isRead: direction === 'OUTBOUND',
						sentAt: receivedAt,
					},
				});

				if (parsed.attachments?.length) {
					await prisma.offerLetterEmailAttachment.createMany({
						data: parsed.attachments.map((a) => ({
							emailId: created.id,
							fileName: a.filename || 'attachment',
							fileSize: a.size ?? a.content.length,
							mimeType: a.contentType || 'application/octet-stream',
							fileData: a.content as any,
							source: direction === 'OUTBOUND' ? 'USER_UPLOADED' : 'CANDIDATE_REPLY',
						})),
					});
				}

				await prisma.offerLetterMailboxMessage.create({
					data: {
						companyId,
						folder: folderPath,
						uid: String(uid),
						fingerprint,
						direction,
						messageId,
						inReplyTo,
						references,
						fromEmail,
						fromName,
						toEmails,
						ccEmails,
						subject,
						body,
						rawHeaders,
						receivedAt,
						linkedEmailId: created.id,
					},
				});
				outcome.imported++;
				outcome.matched++;
			} else {
				const staged = await prisma.offerLetterMailboxMessage.create({
					data: {
						// Deliberately NOT companyId — an unmatched message goes into
						// the cross-company triage pool (see file header) rather than
						// being auto-assigned to the mailbox owner.
						folder: folderPath,
						uid: String(uid),
						fingerprint,
						direction,
						messageId,
						fromEmail,
						fromName,
						toEmails,
						ccEmails,
						subject,
						body,
						rawHeaders,
						receivedAt,
					},
				});
				if (parsed.attachments?.length) {
					await prisma.offerLetterMailboxAttachment.createMany({
						data: parsed.attachments.map((attachment) => ({
							messageId: staged.id,
							fileName: attachment.filename || 'attachment',
							fileSize: attachment.size ?? attachment.content.length,
							mimeType: attachment.contentType || 'application/octet-stream',
							fileData: attachment.content as any,
						})),
					});
				}
				outcome.imported++;
				outcome.unmatched++;
			}

			await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
		}
	} finally {
		try {
			lock.release();
		} catch {
			// Connection may already be dead — nothing to release.
		}
	}

	return outcome;
}

export async function pollOfferLetterInbox(companyId: string, signal?: AbortSignal, isCron = false): Promise<PollResult> {
	const result: PollResult = { scanned: 0, imported: 0, matched: 0, unmatched: 0, stopped: false, hasMore: false, errors: [] };

	if (signal?.aborted) {
		result.stopped = true;
		return result;
	}

	const config = await getOfferLetterMailConfig(companyId);
	const ourAddress = config.smtpUser.trim().toLowerCase();

	const client = await createOfferLetterImapClient(companyId);

	try {
		await raceWithAbort(client.connect(), signal);
	} catch (err) {
		if (isAbortedError(err)) {
			result.stopped = true;
			return result;
		}
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[OFFER_LETTER_POLL] Could not connect (company ${companyId}):`, err);
		result.errors.push(`could not connect (${message})`);
		try {
			await client.logout();
		} catch {
			/* already down */
		}
		return result;
	}

	try {
		const budget = isCron ? CRON_REQUEST_BUDGET : REQUEST_BUDGET;
		const inbox = await processFolder(client, companyId, ourAddress, budget, signal);
		result.scanned += inbox.scanned;
		result.imported += inbox.imported;
		result.matched += inbox.matched;
		result.unmatched += inbox.unmatched;
		result.hasMore = result.hasMore || inbox.hasMore;
	} catch (err) {
		console.error(`[OFFER_LETTER_POLL] INBOX ended mid-batch (company ${companyId}):`, err);
		result.hasMore = true;
	} finally {
		try {
			await client.logout();
		} catch {
			// Already disconnected; logout would just throw again.
		}
	}

	return result;
}

// SUPER_ADMIN's cross-company triage view (and the automatic cron trigger)
// have no single mailbox to poll — this sweeps every configured company's
// mailbox in turn. Bounded by the SAME single budget across all companies
// combined (not per company), and sequential — so an interactive click
// stays snappy and never fans out a burst of connections to every company
// at once. The cron trigger passes isCron=true for a larger budget.
export async function pollAllOfferLetterMailboxes(signal?: AbortSignal, isCron = false): Promise<PollResult> {
	const result: PollResult = { scanned: 0, imported: 0, matched: 0, unmatched: 0, stopped: false, hasMore: false, errors: [] };
	const budget = isCron ? CRON_REQUEST_BUDGET : REQUEST_BUDGET;

	const configs = await prisma.offerLetterMailConfig.findMany({ select: { companyId: true } });

	for (const { companyId } of configs) {
		if (signal?.aborted) {
			result.stopped = true;
			break;
		}
		if (result.scanned >= budget) {
			// Budget spent on earlier companies — the rest haven't been checked
			// this round, so there may well be more waiting. Next run resumes.
			result.hasMore = true;
			break;
		}

		const outcome = await pollOfferLetterInbox(companyId, signal, isCron);
		result.scanned += outcome.scanned;
		result.imported += outcome.imported;
		result.matched += outcome.matched;
		result.unmatched += outcome.unmatched;
		result.hasMore = result.hasMore || outcome.hasMore;
		result.stopped = result.stopped || outcome.stopped;
		result.errors.push(...outcome.errors.map((e) => `[${companyId}] ${e}`));
	}

	return result;
}
