// PUBLIC candidate offer response (no login).
//   GET  ?token=...            → safe offer summary + whether it can still be responded to
//   POST { token, decision }   → records ACCEPTED / DECLINED, aligns the application
// Secured by a signed, expiring token (see response-token.ts). The offer's own
// state prevents responding twice. POST is rate-limited per IP.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import rateLimit from '@/app/lib/rateLimiter'
import { verifyOfferResponseToken } from '@/app/lib/offers/response-token'
import { getResponseDeadline, isResponseExpired, OFFER_RESPONSE_DAYS } from '@/app/lib/offers/response-window'

const ipLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 5000 })

// Offer states a candidate can still respond from (i.e. dispatched, not decided).
const RESPONDABLE = ['SENT', 'APPROVED', 'AWAITING_SIGNATURE']

const fmtDeadline = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

const clientIp = (request: NextRequest) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  'unknown'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

async function loadOffer(offerId: string) {
  return prisma.offer.findUnique({
    where: { id: offerId },
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      application: { select: { job: { select: { title: true } } } },
      company: { select: { companyName: true } },
    },
  })
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = new URL(request.url).searchParams.get('token') || ''
    const claims = verifyOfferResponseToken(token)
    if (!claims) {
      return withCors(ApiResponse.error('This link is invalid or has expired.', 400), origin)
    }

    const offer = await loadOffer(claims.offerId)
    if (!offer || (claims.candidateId && offer.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Offer not found.', 404), origin)
    }

    const candidateName = `${offer.candidate?.firstName || ''} ${offer.candidate?.lastName || ''}`.trim()
    const deadline = getResponseDeadline(offer)
    const expired = isResponseExpired(offer, deadline)
    const accepted = offer.status === 'ACCEPTED'
    const declined = offer.status === 'DECLINED'
    const signedUploaded = !!offer.executedPdfPath

    return withCors(
      ApiResponse.success({
        candidateName: candidateName || 'Candidate',
        jobTitle: offer.application?.job?.title || 'the role',
        company: offer.company?.companyName || 'the company',
        proposedStartDate: offer.proposedStartDate || null,
        status: offer.status,
        responseDeadline: deadline ? deadline.toISOString() : null,
        responseDays: OFFER_RESPONSE_DAYS,
        expired,
        accepted,
        declined,
        signedUploaded,
        complete: accepted && signedUploaded,
        // The candidate may accept/decline while dispatched and not expired.
        canRespond: RESPONDABLE.includes(offer.status) && !expired,
        // After accepting, they may upload the signed letter until the deadline.
        canUpload: accepted && !signedUploaded && !expired,
      }, 'OK'),
      origin,
    )
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    try {
      await ipLimiter.check(20, `offer-respond:ip:${clientIp(request)}`)
    } catch {
      return withCors(ApiResponse.error('Too many attempts. Please try again shortly.', 429), origin)
    }

    const body = await request.json().catch(() => ({}))
    const token = String(body.token || '')
    const decision = String(body.decision || '').trim().toUpperCase()
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : ''

    if (!['ACCEPTED', 'DECLINED'].includes(decision)) {
      return withCors(ApiResponse.error("decision must be 'ACCEPTED' or 'DECLINED'", 400), origin)
    }

    const claims = verifyOfferResponseToken(token)
    if (!claims) {
      return withCors(ApiResponse.error('This link is invalid or has expired.', 400), origin)
    }

    const offer = await loadOffer(claims.offerId)
    if (!offer || (claims.candidateId && offer.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Offer not found.', 404), origin)
    }

    // Idempotent: if already decided, report it rather than erroring.
    if (offer.status === 'ACCEPTED') {
      return withCors(ApiResponse.success(
        { alreadyResponded: true, decision: 'ACCEPTED', canUpload: !offer.executedPdfPath },
        'You have already accepted this offer.',
      ), origin)
    }
    if (offer.status === 'DECLINED') {
      return withCors(ApiResponse.success(
        { alreadyResponded: true, decision: 'DECLINED' },
        'You have already declined this offer.',
      ), origin)
    }

    // Enforce the response window.
    const deadline = getResponseDeadline(offer)
    if (isResponseExpired(offer, deadline)) {
      return withCors(ApiResponse.error(
        `This offer expired on ${fmtDeadline(deadline)} and can no longer be responded to. Please contact the hiring team.`,
        409,
      ), origin)
    }
    if (!RESPONDABLE.includes(offer.status)) {
      return withCors(ApiResponse.error('This offer is not currently available for a response.', 409), origin)
    }

    const now = new Date()
    const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}

    await prisma.offer.update({
      where: { id: offer.id },
      data: {
        status: decision as any,
        ...(decision === 'ACCEPTED' ? { acceptedAt: now } : {}),
        updatedBy: 'candidate',
        metadata: {
          ...meta,
          respondedAt: now.toISOString(),
          respondedVia: 'candidate-link',
          displayStatus: decision === 'ACCEPTED' ? 'Accepted' : 'Declined',
          ...(note ? { candidateNote: note } : {}),
        } as any,
      },
    })

    // Keep the pipeline application status in step with the candidate's decision.
    if (offer.applicationId) {
      await prisma.jobApplication.update({
        where: { id: offer.applicationId },
        data: { status: decision === 'ACCEPTED' ? 'HIRED' : 'REJECTED', updatedBy: 'candidate' },
      }).catch(() => {})
    }

    return withCors(ApiResponse.success(
      { decision, canUpload: decision === 'ACCEPTED' },
      decision === 'ACCEPTED'
        ? 'Offer accepted. Please upload your signed offer letter below to complete the process.'
        : 'Your response has been recorded. Thank you for letting us know.',
    ), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
