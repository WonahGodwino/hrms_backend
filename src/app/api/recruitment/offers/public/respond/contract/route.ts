// PUBLIC candidate upload of the signed offer letter (no login).
//   POST (multipart)  { token, file }  → stores the signed PDF and completes the
//   acceptance. Only allowed for an ACCEPTED offer that hasn't expired; a
//   declined offer can never upload. Completing this creates the onboarding
//   record so the hire flows into the Command Center.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import rateLimit from '@/app/lib/rateLimiter'
import { verifyOfferResponseToken } from '@/app/lib/offers/response-token'
import { getResponseDeadline, isResponseExpired } from '@/app/lib/offers/response-window'
import { promises as fs } from 'fs'
import * as path from 'path'

const ipLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 5000 })

const clientIp = (request: NextRequest) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') ||
  'unknown'

const fmtDeadline = (d: Date | null) =>
  d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    try {
      await ipLimiter.check(15, `offer-contract:ip:${clientIp(request)}`)
    } catch {
      return withCors(ApiResponse.error('Too many attempts. Please try again shortly.', 429), origin)
    }

    const formData = await request.formData()
    const token = String(formData.get('token') || '')
    const file = formData.get('file') as File | null

    const claims = verifyOfferResponseToken(token)
    if (!claims) {
      return withCors(ApiResponse.error('This link is invalid or has expired.', 400), origin)
    }
    if (!file) return withCors(ApiResponse.error('No file uploaded', 400), origin)

    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (ext !== 'pdf' && file.type !== 'application/pdf') {
      return withCors(ApiResponse.error('The signed offer letter must be a PDF', 400), origin)
    }

    const offer = await prisma.offer.findUnique({ where: { id: claims.offerId } })
    if (!offer || (claims.candidateId && offer.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Offer not found.', 404), origin)
    }

    // A declined offer can never upload; only an accepted, un-expired offer can.
    if (offer.status === 'DECLINED') {
      return withCors(ApiResponse.error('This offer was declined and can no longer be signed.', 409), origin)
    }
    if (offer.status !== 'ACCEPTED') {
      return withCors(ApiResponse.error('Please accept the offer before uploading your signed letter.', 409), origin)
    }
    const deadline = getResponseDeadline(offer)
    if (isResponseExpired(offer, deadline)) {
      return withCors(ApiResponse.error(
        `This offer expired on ${fmtDeadline(deadline)}. Please contact the hiring team.`,
        409,
      ), origin)
    }

    // Persist under public/ (same convention as the HR executed-contract upload).
    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadDir = path.join(process.cwd(), 'public', 'offers', 'executed', offer.id)
    await fs.mkdir(uploadDir, { recursive: true })
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${Date.now()}_${safeName}`
    await fs.writeFile(path.join(uploadDir, fileName), buffer)
    const relativePath = `/offers/executed/${offer.id}/${fileName}`

    const now = new Date()
    const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}

    await prisma.offer.update({
      where: { id: offer.id },
      data: {
        executedPdfPath: relativePath,
        acceptedAt: offer.acceptedAt || now,
        updatedBy: 'candidate',
        metadata: { ...meta, signedUploadedAt: now.toISOString(), respondedVia: 'candidate-link' } as any,
      },
    })

    // Create (or reuse) the onboarding record now that acceptance is complete.
    let onboardingId: string | null = null
    const existing = await prisma.onboarding.findUnique({ where: { offerId: offer.id } }).catch(() => null)
    if (existing) {
      onboardingId = existing.id
    } else {
      const onboarding = await prisma.onboarding.create({
        data: {
          companyId: offer.companyId,
          offerId: offer.id,
          status: 'IN_PROGRESS',
          startDate: offer.proposedStartDate || now,
          createdBy: 'candidate',
        },
      })
      onboardingId = onboarding.id
    }

    return withCors(ApiResponse.success(
      { complete: true, onboardingId },
      'Thank you — your signed offer letter has been received and your acceptance is complete. The team will be in touch about your onboarding.',
    ), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
