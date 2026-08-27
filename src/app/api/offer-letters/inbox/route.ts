// src/app/api/offer-letters/inbox/route.ts
//
// GET — aggregated email inbox for a company's offer-letter emails.
// Supports filtering by direction (INBOUND | OUTBOUND | ALL), pagination,
// and an optional letterId to scope to a single letter's thread.
// Returns each email row with its letter's recipient info so the inbox
// list can show who the email was sent to / received from.
import { NextRequest } from 'next/server';

import { handleCorsOptions, withCors } from '@/app/lib/cors';
import { prisma } from '@/app/lib/db';
import { requireModuleAccess } from '@/app/lib/module-access';
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access';
import { ApiResponse, handleApiError } from '@/app/lib/utils';

export async function OPTIONS(request: NextRequest) {
	return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
	const origin = request.headers.get('origin');
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin);

		const token = authHeader.replace('Bearer ', '');
		const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN']);

		const companyId = request.nextUrl.searchParams.get('companyId');
		if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin);

		const hasAccess = await validateOfferLetterCompanyAccess(user, companyId);
		if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin);

		const direction = request.nextUrl.searchParams.get('direction'); // INBOUND | OUTBOUND | ALL | DRAFT
		const letterId = request.nextUrl.searchParams.get('letterId'); // optional — scope to one thread
		const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1', 10));
		const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '30', 10)));

		const where: any = { companyId };
		if (letterId) where.letterId = letterId;
		if (direction === 'INBOUND') where.direction = 'INBOUND';
		else if (direction === 'OUTBOUND') where.direction = 'OUTBOUND';
		// 'ALL' or undefined → no filter

		// Staged (triaged/assigned) messages use the exact same direction
		// filter as real OfferLetterEmail rows — NOT a folder check. A message
		// imported from the Sent folder (a staff member's manual webmail
		// reply) is still a legitimate OUTBOUND item that belongs in the Sent
		// tab; a folder-based filter would hide it forever regardless of
		// which company it's assigned to. This previously also hardcoded
		// `folder: 'INBOX'` and skipped staged messages entirely whenever
		// direction === 'OUTBOUND' — which meant a message assigned via the
		// SUPER_ADMIN triage page could never appear in either tab unless it
		// happened to be an INBOX-origin INBOUND message. That's the bug: the
		// one thing the triage page exists to do (make an assigned message
		// visible to its company) silently didn't work for anything else.
		// A staged message has no direct link to a specific GeneratedOfferLetter
		// (only optionally to an OfferLetterEmail via linkedEmailId, which is a
		// different id space) — so a per-letter thread view (letterId set)
		// correctly shows none of them; they're definitionally not tied to one
		// letter until further linked. companyId-wide views (no letterId) do
		// include them.
		const includeStaged = !letterId;
		const stagedWhere: any = { companyId };
		if (direction === 'INBOUND') stagedWhere.direction = 'INBOUND';
		else if (direction === 'OUTBOUND') stagedWhere.direction = 'OUTBOUND';

		const [emailItems, emailTotal, stagedItems, stagedTotal] = await Promise.all([
			prisma.offerLetterEmail.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				skip: 0,
				take: 1000,
				include: {
					letter: {
						select: {
							id: true,
							recipientName: true,
							recipientEmail: true,
							fileName: true,
							month: true,
							year: true,
							template: { select: { id: true, name: true } },
						},
					},
					attachments: {
						select: { id: true, fileName: true, fileSize: true, mimeType: true, source: true },
					},
				},
			}),
			prisma.offerLetterEmail.count({ where }),
			includeStaged
				? prisma.offerLetterMailboxMessage.findMany({
						where: stagedWhere,
						orderBy: { receivedAt: 'desc' },
						take: 1000,
						include: { attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true } } },
				  })
				: Promise.resolve([]),
			includeStaged ? prisma.offerLetterMailboxMessage.count({ where: stagedWhere }) : Promise.resolve(0),
		]);

		const stagedAsInboxItems = (stagedItems as any[]).map((message) => ({
			...message,
			toEmail: Array.isArray(message.toEmails) ? message.toEmails[0] || '' : '',
			toName: '',
			isRead: message.isRead,
			sentAt: message.receivedAt,
			letter: null,
			attachments: message.attachments.map((attachment: any) => ({
				...attachment,
				source: message.direction === 'OUTBOUND' ? 'USER_UPLOADED' : 'CANDIDATE_REPLY',
			})),
		}));
		const allItems = [...emailItems, ...stagedAsInboxItems].sort(
			(left: any, right: any) => new Date(right.sentAt || right.createdAt).getTime() - new Date(left.sentAt || left.createdAt).getTime()
		);
		const items = allItems.slice((page - 1) * limit, page * limit);
		const total = emailTotal + stagedTotal;

		// Count unread inbound messages (for badge display) — same
		// folder-agnostic reasoning as the listing query above.
		const [unreadEmailCount, unreadStagedCount] = await Promise.all([
			prisma.offerLetterEmail.count({ where: { companyId, direction: 'INBOUND', isRead: false } }),
			prisma.offerLetterMailboxMessage.count({ where: { companyId, direction: 'INBOUND', isRead: false } }),
		]);
		const unreadCount = unreadEmailCount + unreadStagedCount;

		return withCors(
			ApiResponse.success({
				items,
				unreadCount,
				pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
			}),
			origin
		);
	} catch (error) {
		return withCors(handleApiError(error), origin);
	}
}
