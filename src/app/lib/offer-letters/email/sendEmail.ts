// src/app/lib/offer-letters/email/sendEmail.ts
//
// Composes and sends one offer-letter email via the Hostinger SMTP
// transport, then records the result (SENT or FAILED) as an OfferLetterEmail
// row regardless of outcome, so a failed send is still visible in the
// thread with its error message rather than silently disappearing.
import { randomUUID } from 'crypto';
import MailComposer from 'nodemailer/lib/mail-composer';

import { prisma } from '@/app/lib/db';

import { appendOfferLetterToSent } from './mailbox';
import { substituteEmailVariables } from './templateSubstitution';
import { getOfferLetterSenderIdentity, getOfferLetterSmtpTransport } from './transport';

export interface OfferLetterEmailAttachmentInput {
	fileName: string;
	mimeType: string;
	data: Buffer;
	source: 'SYSTEM_LETTER' | 'USER_UPLOADED';
}

export interface SendOfferLetterEmailParams {
	letterId: string;
	companyId: string;
	templateId?: string | null;
	subjectOverride?: string;
	bodyOverride?: string;
	toEmailOverride?: string;
	toNameOverride?: string;
	ccEmails?: string[];
	bccEmails?: string[];
	autoAttachLetterOverride?: boolean;
	extraAttachments?: { fileName: string; mimeType: string; data: Buffer }[];
	userId: string;
}

const DEFAULT_SUBJECT = 'Your Offer Letter';
const DEFAULT_BODY = '<p>Dear {{recipientName}},</p><p>Please find your offer letter attached.</p>';

function assertAttachmentSize(bytes: number, fileName: string) {
	const maxMb = parseFloat(process.env.OFFER_LETTER_MAX_ATTACHMENT_MB || '10');
	const maxBytes = maxMb * 1024 * 1024;
	if (bytes > maxBytes) {
		throw new Error(`Attachment "${fileName}" exceeds the ${maxMb}MB limit.`);
	}
}

export async function sendOfferLetterEmail(params: SendOfferLetterEmailParams) {
	const letter = await prisma.generatedOfferLetter.findFirst({
		where: { id: params.letterId, companyId: params.companyId },
	});
	if (!letter) {
		throw new Error('Offer letter not found for this company.');
	}

	const template = params.templateId
		? await prisma.offerLetterEmailTemplate.findFirst({
				where: { id: params.templateId, companyId: params.companyId, isActive: true },
		  })
		: null;

	const substitutionValues: Record<string, unknown> = {
		...((letter.variableValues as Record<string, unknown>) || {}),
		recipientName: letter.recipientName,
		recipientEmail: letter.recipientEmail,
		month: letter.month,
		year: letter.year,
	};

	const rawSubject = params.subjectOverride ?? template?.subject ?? DEFAULT_SUBJECT;
	const rawBody = params.bodyOverride ?? template?.body ?? DEFAULT_BODY;
	const signature = template?.signatureHtml || '';

	const subject = substituteEmailVariables(rawSubject, substitutionValues);
	// Reply-matching fallback for when a relay/webmail client strips
	// In-Reply-To/References: an invisible HTML comment carrying the first
	// 12 characters of the letter's (already-unique) id. Never rendered by
	// any mail client — not styled-to-be-hidden text, an actual comment —
	// so nothing about the message a candidate sees changes. Read back in
	// inboundPoll.ts only when the header-based match fails.
	const refToken = letter.id.slice(0, 12);
	const body =
		substituteEmailVariables(rawBody, substitutionValues) +
		(signature ? `<br/>${substituteEmailVariables(signature, substitutionValues)}` : '') +
		`<!-- ref:${refToken} -->`;

	const toEmail = params.toEmailOverride || letter.recipientEmail;
	const toName = params.toNameOverride || letter.recipientName;
	const ccEmails = params.ccEmails ?? ((template?.ccEmails as string[]) || []);
	const bccEmails = params.bccEmails ?? ((template?.bccEmails as string[]) || []);
	const autoAttachLetter = params.autoAttachLetterOverride ?? template?.autoAttachLetter ?? true;

	const attachmentInputs: OfferLetterEmailAttachmentInput[] = [];
	if (autoAttachLetter) {
		const letterBuffer = letter.fileData as Buffer;
		assertAttachmentSize(letterBuffer.length, letter.fileName);
		attachmentInputs.push({
			fileName: letter.fileName,
			mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			data: letterBuffer,
			source: 'SYSTEM_LETTER',
		});
	}
	for (const extra of params.extraAttachments || []) {
		assertAttachmentSize(extra.data.length, extra.fileName);
		attachmentInputs.push({ ...extra, source: 'USER_UPLOADED' });
	}

	const sender = await getOfferLetterSenderIdentity(params.companyId);
	const senderDomain = sender.email.split('@')[1] || 'isurfglobal.com';
	const messageId = `<${randomUUID()}@${senderDomain}>`;

	let status: 'SENT' | 'FAILED' = 'SENT';
	let errorMessage: string | null = null;

	try {
		const transporter = await getOfferLetterSmtpTransport(params.companyId);
		const mailOptions = {
			from: `"${sender.name}" <${sender.email}>`,
			to: `"${toName}" <${toEmail}>`,
			cc: ccEmails.length ? ccEmails : undefined,
			bcc: bccEmails.length ? bccEmails : undefined,
			subject,
			html: body,
			messageId,
			// Secondary matching signal for reply detection — some gateways strip
			// custom headers, so In-Reply-To/References (set automatically by the
			// candidate's mail client from our Message-ID) remains the primary path.
			headers: { 'X-Offer-Letter-Id': letter.id },
			attachments: attachmentInputs.map((a) => ({ filename: a.fileName, content: a.data, contentType: a.mimeType })),
		};
		await transporter.sendMail(mailOptions);

		// SMTP submission does not reliably copy messages into the mailbox's
		// Sent folder, so append the exact submitted MIME message explicitly.
		const rawMessage = await new MailComposer(mailOptions).compile().build();
		try {
			await appendOfferLetterToSent(rawMessage, params.companyId);
		} catch (archiveError) {
			// The candidate still received the message; archival can be retried
			// independently without misreporting the send as failed.
			console.error('Offer letter sent but Hostinger Sent archival failed:', archiveError);
		}
	} catch (err: any) {
		status = 'FAILED';
		errorMessage = err?.message || 'Failed to send email.';
	}

	const emailRow = await prisma.offerLetterEmail.create({
		data: {
			companyId: params.companyId,
			letterId: letter.id,
			templateId: template?.id || null,
			direction: 'OUTBOUND',
			fromEmail: sender.email,
			fromName: sender.name,
			toEmail,
			toName,
			ccEmails: ccEmails.length ? ccEmails : undefined,
			bccEmails: bccEmails.length ? bccEmails : undefined,
			subject,
			body,
			status,
			messageId: status === 'SENT' ? messageId : null,
			errorMessage,
			isRead: true, // outbound mail is HR's own — never shows as unread
			sentAt: status === 'SENT' ? new Date() : null,
		},
	});

	if (status === 'SENT' && attachmentInputs.length > 0) {
		await prisma.offerLetterEmailAttachment.createMany({
			data: attachmentInputs.map((a) => ({
				emailId: emailRow.id,
				fileName: a.fileName,
				fileSize: a.data.length,
				mimeType: a.mimeType,
				fileData: a.data as any,
				source: a.source,
			})),
		});
	}

	return emailRow;
}
