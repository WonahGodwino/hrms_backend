// src/app/api/offers/[id]/dispatch/route.ts
// POST /api/offers/:id/dispatch
// Dispatches a prepared (ad-hoc) offer to the candidate. "automated" emails the
// attached PDF; "manual" only updates status. Resulting status depends on the
// trackSignature flag captured at creation.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { sendEmail } from '@/app/lib/email'
import { OFFER_DISPLAY_STATUS, readOfferMetadata } from '@/app/lib/offers/ad-hoc-helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }
    const companyId = String(user.companyId)

    const body = await request.json().catch(() => ({}))
    const method = String(body?.method || '').trim().toLowerCase()
    const subject = body?.subject ? String(body.subject) : ''
    const message = body?.message ? String(body.message) : ''

    if (method !== 'automated' && method !== 'manual') {
      return withCors(ApiResponse.error("method must be 'automated' or 'manual'", 400), origin)
    }
    if (method === 'automated' && !subject.trim()) {
      return withCors(ApiResponse.error('subject is required for automated dispatch', 400), origin)
    }

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
      include: { candidate: true },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const meta = readOfferMetadata(offer.metadata)
    const trackSignature = !!meta.trackSignature

    // Guard against re-dispatching an already accepted/executed offer.
    if (offer.status === 'ACCEPTED' || offer.status === 'DECLINED') {
      return withCors(
        ApiResponse.error(`Offer cannot be dispatched from status ${offer.status}`, 409),
        origin
      )
    }

    // Automated: email the attached PDF to the candidate.
    if (method === 'automated') {
      const offerFile = meta.offerFileId
        ? await prisma.candidateFile.findFirst({
            where: { id: meta.offerFileId, companyId },
            select: { fileName: true, mimeType: true, data: true },
          })
        : null

      const sendResult = await sendEmail({
        to: offer.candidate.email,
        subject,
        html: message || `<p>Please find your offer letter attached.</p>`,
        text: 'Please find your offer letter attached.',
        attachments: offerFile
          ? [
              {
                filename: offerFile.fileName || 'offer.pdf',
                data: Buffer.from(offerFile.data),
                contentType: offerFile.mimeType || 'application/pdf',
              },
            ]
          : undefined,
      })

      if (!sendResult.success) {
        return withCors(
          ApiResponse.error(`Failed to email the offer: ${sendResult.error || 'unknown error'}`, 502),
          origin
        )
      }
    }

    const dispatchedAt = new Date()
    const displayStatus = trackSignature
      ? OFFER_DISPLAY_STATUS.AWAITING_SIGNATURE
      : OFFER_DISPLAY_STATUS.SENT_CLOSED

    await prisma.offer.update({
      where: { id: offer.id },
      data: {
        status: 'SENT',
        sentAt: dispatchedAt,
        updatedBy: user.userId || user.email || 'system',
        metadata: {
          ...meta,
          displayStatus,
          dispatchMethod: method,
          dispatchedAt: dispatchedAt.toISOString(),
        },
      },
    })

    return withCors(
      ApiResponse.success(
        {
          offerId: offer.id,
          status: displayStatus,
          dispatchedAt: dispatchedAt.toISOString(),
          method,
        },
        'Offer dispatched successfully.'
      ),
      origin
    )
  } catch (error) {
    console.error('❌ Offer dispatch error:', error)
    return withCors(handleApiError(error), origin)
  }
}
