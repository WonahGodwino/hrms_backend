// POST /api/recruitment/offers/:id/send-letter
// Renders the offer letter, generates a PDF, and emails it to the candidate using
// the existing Mailgun sendEmail service. Logs the attempt to EmailLog and moves
// the offer to SENT. Body (optional): { templateId, cc, message }
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendEmail } from '@/app/lib/email'
import { resolveOfferLetter } from '@/app/lib/offers/offer-letter'
import { htmlToPdf } from '@/app/lib/offers/offer-letter-pdf'
import { signOfferResponseToken } from '@/app/lib/offers/response-token'
import { OFFER_RESPONSE_DAYS } from '@/app/lib/offers/response-window'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://247hr.co.uk'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const letter = await resolveOfferLetter(id, { companyId: user.companyId, role: user.role, templateId: body.templateId })
    if (!letter) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const to = letter.candidate?.email
    if (!to) return withCors(ApiResponse.error('Candidate has no email address on file', 400), origin)

    const companyName = letter.company?.companyName || 'the company'
    const candidateName = `${letter.candidate?.firstName || ''} ${letter.candidate?.lastName || ''}`.trim()
    const subject = (typeof body.subject === 'string' && body.subject.trim())
      ? body.subject.trim()
      : `Letter of Employment — ${companyName}`

    // Generate the PDF attachment (must succeed before we email/log).
    let pdf: Buffer
    try {
      pdf = await htmlToPdf(letter.fullHtml)
    } catch (pdfErr: any) {
      return withCors(ApiResponse.error(`Failed to generate offer PDF: ${pdfErr?.message || 'unknown error'}`, 500), origin)
    }

    // Secure, expiring link so the candidate can accept/decline online.
    const now = new Date()
    // Per-company response window (multi-tenant), falling back to the default.
    const companyCfg = await (prisma as any).company
      .findUnique({ where: { id: letter.offer.companyId }, select: { offerResponseDays: true } })
      .catch(() => null)
    const days = companyCfg?.offerResponseDays && companyCfg.offerResponseDays > 0
      ? companyCfg.offerResponseDays
      : OFFER_RESPONSE_DAYS
    const deadline = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    const deadlineText = deadline.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const responseToken = signOfferResponseToken(letter.offer.id, letter.candidate?.id || '')
    const responseLink = `${FRONTEND_URL}/offer/respond?token=${encodeURIComponent(responseToken)}`

    const introMessage = typeof body.message === 'string' && body.message.trim()
      ? `<p>${body.message}</p>`
      : `<p>Dear ${candidateName || 'Candidate'},</p>
         <p>Congratulations! Please find attached your Letter of Employment from ${companyName}.
         Kindly review the details in the attached letter.</p>`

    const responseCta = `
      <p style="margin:20px 0">
        <a href="${responseLink}"
           style="background:#137fec;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">
          Respond to your offer
        </a>
      </p>
      <p style="color:#475569;font-size:13px">
        Use the button above to <strong>accept</strong> or <strong>decline</strong> this offer online.
        If you accept, you will then upload your <strong>signed offer letter</strong> on the same page.
        If the button doesn't work, copy and paste this URL:<br/>
        <span style="word-break:break-all">${responseLink}</span>
      </p>
      <div style="margin:22px 0;padding:14px 16px;border:2px solid #dc2626;border-radius:8px;background:#fef2f2">
        <p style="margin:0;color:#991b1b;font-size:15px;font-weight:800;text-transform:uppercase;letter-spacing:0.02em">
          ⏰ Important — respond within ${days} days
        </p>
        <p style="margin:8px 0 0;color:#7f1d1d;font-size:14px;font-weight:600">
          You must accept and upload your signed offer letter by
          <span style="font-weight:800;text-decoration:underline">${deadlineText}</span>.
          If we do not receive your signed acceptance by this date, this offer will be
          <strong>withdrawn</strong> and may be extended to another candidate.
        </p>
      </div>`

    const emailHtml = `${introMessage}${responseCta}<p>Best regards,<br/>${companyName}</p>`
    const emailText = `Dear ${candidateName || 'Candidate'},\n\nCongratulations! Please find attached your Letter of Employment from ${companyName}. Kindly review the attached letter.\n\nTo accept or decline this offer online, and (if you accept) upload your signed offer letter, visit:\n${responseLink}\n\n*** IMPORTANT — RESPOND WITHIN ${days} DAYS ***\nYou must accept and upload your signed offer letter by ${deadlineText}. If we do not receive your signed acceptance by this date, this offer will be WITHDRAWN and may be extended to another candidate.\n\nBest regards,\n${companyName}`

    const result = await sendEmail({
      to,
      cc: body.cc || undefined,
      subject,
      html: emailHtml,
      text: emailText,
      attachments: [{ filename: letter.filename, data: pdf, contentType: 'application/pdf' }],
    })

    // Log the attempt (non-critical if logging itself fails).
    try {
      await prisma.emailLog.create({
        data: {
          companyId: letter.offer.companyId,
          emailType: 'OFFER_LETTER',
          recipient: to,
          status: result.success ? 'SENT' : 'FAILED',
          sentBy: user.userId,
          error: result.success ? null : (result.error || 'Failed to send'),
          metadata: {
            offerId: letter.offer.id,
            candidateId: letter.candidate?.id,
            templateId: letter.templateId,
          },
        },
      })
    } catch (logErr) {
      console.error('Failed to log offer letter email (non-critical):', logErr)
    }

    if (!result.success) {
      return withCors(ApiResponse.error(result.error || 'Failed to send offer letter email', 502), origin)
    }

    // Advance the offer lifecycle now that the letter has been dispatched.
    await prisma.offer.update({
      where: { id: letter.offer.id },
      data: {
        status: 'SENT',
        sentAt: now,
        dispatchedAt: now,
        dispatchMethod: 'EMAIL',
        metadata: {
          ...((letter.offer.metadata && typeof letter.offer.metadata === 'object') ? letter.offer.metadata as any : {}),
          letterSentAt: now.toISOString(),
          letterTemplateId: letter.templateId,
          responseDeadline: deadline.toISOString(),
        } as any,
      },
    })

    // Keep the application status in step with the offer.
    if (letter.offer.applicationId) {
      await prisma.jobApplication.update({
        where: { id: letter.offer.applicationId },
        data: { status: 'OFFERED', updatedBy: user.userId },
      }).catch(() => {})
    }

    return withCors(ApiResponse.success({
      offerId: letter.offer.id,
      status: 'SENT',
      recipient: to,
      sentAt: now.toISOString(),
    }, 'Offer letter sent successfully.'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
