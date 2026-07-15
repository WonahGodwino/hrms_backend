// PUBLIC candidate document upload (no login), used AFTER the candidate accepts.
//   GET  ?token=...                    → the required-document checklist + what's uploaded
//   POST (multipart) { token, category, file } → stores one required document
// Token-gated (offer-response token). Only an ACCEPTED, un-expired offer can
// upload. Onboarding is NOT created here — HR initiates it; when they do, these
// documents are linked to the onboarding automatically.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import rateLimit from '@/app/lib/rateLimiter'
import { verifyOfferResponseToken } from '@/app/lib/offers/response-token'
import { getResponseDeadline, isResponseExpired } from '@/app/lib/offers/response-window'
import { CANDIDATE_REQUIRED_DOCS, REQUIRED_CATEGORIES, docFor } from '@/app/lib/offers/candidate-documents'
import { promises as fs } from 'fs'
import * as path from 'path'

const ipLimiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 5000 })

const clientIp = (request: NextRequest) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  request.headers.get('x-real-ip') || 'unknown'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

async function uploadedByCategory(candidateId: string) {
  const docs = await (prisma as any).candidateDocument.findMany({
    where: { candidateId, category: { in: REQUIRED_CATEGORIES }, archived: 0 },
    orderBy: { createdAt: 'desc' },
  })
  const byCat: Record<string, any> = {}
  for (const d of docs) if (!byCat[d.category]) byCat[d.category] = d
  return byCat
}

function checklist(byCat: Record<string, any>) {
  const items = CANDIDATE_REQUIRED_DOCS.map((d) => ({
    category: d.category,
    label: d.label,
    hint: d.hint || null,
    accept: d.accept,
    uploaded: !!byCat[d.category],
    fileName: byCat[d.category]?.fileName || null,
    uploadedAt: byCat[d.category]?.createdAt ? new Date(byCat[d.category].createdAt).toISOString() : null,
  }))
  const done = items.filter((i) => i.uploaded).length
  return { items, uploaded: done, total: items.length, complete: done === items.length }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = new URL(request.url).searchParams.get('token') || ''
    const claims = verifyOfferResponseToken(token)
    if (!claims) return withCors(ApiResponse.error('This link is invalid or has expired.', 400), origin)

    const offer = await prisma.offer.findUnique({
      where: { id: claims.offerId },
      select: { id: true, candidateId: true, status: true },
    })
    if (!offer || (claims.candidateId && offer.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Offer not found.', 404), origin)
    }
    if (offer.status !== 'ACCEPTED') {
      return withCors(ApiResponse.success({ accepted: false, ...checklist({}) }, 'Accept the offer to upload documents.'), origin)
    }
    const byCat = await uploadedByCategory(offer.candidateId)
    return withCors(ApiResponse.success({ accepted: true, ...checklist(byCat) }, 'OK'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    try { await ipLimiter.check(30, `offer-docs:ip:${clientIp(request)}`) }
    catch { return withCors(ApiResponse.error('Too many attempts. Please try again shortly.', 429), origin) }

    const formData = await request.formData()
    const token = String(formData.get('token') || '')
    const category = String(formData.get('category') || '').trim().toUpperCase()
    const file = formData.get('file') as File | null

    const claims = verifyOfferResponseToken(token)
    if (!claims) return withCors(ApiResponse.error('This link is invalid or has expired.', 400), origin)
    const spec = docFor(category)
    if (!spec) return withCors(ApiResponse.error('Unknown document type.', 400), origin)
    if (!file) return withCors(ApiResponse.error('No file uploaded.', 400), origin)

    const offer = await prisma.offer.findUnique({ where: { id: claims.offerId } })
    if (!offer || (claims.candidateId && offer.candidateId !== claims.candidateId)) {
      return withCors(ApiResponse.error('Offer not found.', 404), origin)
    }
    if (offer.status === 'DECLINED') return withCors(ApiResponse.error('This offer was declined.', 409), origin)
    if (offer.status !== 'ACCEPTED') return withCors(ApiResponse.error('Please accept the offer before uploading documents.', 409), origin)
    const deadline = getResponseDeadline(offer)
    if (isResponseExpired(offer, deadline)) {
      return withCors(ApiResponse.error('This offer has expired. Please contact the hiring team.', 409), origin)
    }

    // File-type gate.
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const isPdf = ext === 'pdf' || file.type === 'application/pdf'
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) || file.type.startsWith('image/')
    const ok = spec.accept === 'pdf' ? isPdf : (isPdf || isImage)
    if (!ok) {
      return withCors(ApiResponse.error(
        spec.accept === 'pdf' ? `${spec.label} must be a PDF.` : `${spec.label} must be a PDF or image.`, 400,
      ), origin)
    }
    if (file.size > 15 * 1024 * 1024) return withCors(ApiResponse.error('File must be 15MB or smaller.', 400), origin)

    // Persist under public/ (same convention as executed contracts).
    const buffer = Buffer.from(await file.arrayBuffer())
    const dir = path.join(process.cwd(), 'public', 'candidate-docs', offer.candidateId, category)
    await fs.mkdir(dir, { recursive: true })
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${Date.now()}_${safeName}`
    await fs.writeFile(path.join(dir, fileName), buffer)
    const relativePath = `/candidate-docs/${offer.candidateId}/${category}/${fileName}`

    // Link to an onboarding if one already exists for this offer.
    const onboarding = await prisma.onboarding.findUnique({ where: { offerId: offer.id }, select: { id: true } }).catch(() => null)

    // Upsert: replace any prior file for this category.
    const existing = await (prisma as any).candidateDocument.findFirst({
      where: { candidateId: offer.candidateId, category, archived: 0 },
    })
    if (existing) {
      await (prisma as any).candidateDocument.update({
        where: { id: existing.id },
        data: { filePath: relativePath, fileName: file.name, type: spec.type as any, onboardingId: onboarding?.id || existing.onboardingId || null, uploadedBy: 'candidate' },
      })
    } else {
      await (prisma as any).candidateDocument.create({
        data: {
          companyId: offer.companyId,
          candidateId: offer.candidateId,
          onboardingId: onboarding?.id || null,
          category,
          type: spec.type as any,
          filePath: relativePath,
          fileName: file.name,
          uploadedBy: 'candidate',
        },
      })
    }

    // The signed offer letter also drives the offer's executed-contract state.
    if (category === 'SIGNED_OFFER') {
      const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}
      await prisma.offer.update({
        where: { id: offer.id },
        data: { executedPdfPath: relativePath, metadata: { ...meta, signedUploadedAt: new Date().toISOString() } as any },
      })
    }

    const byCat = await uploadedByCategory(offer.candidateId)
    const state = checklist(byCat)
    return withCors(ApiResponse.success(
      state,
      state.complete
        ? 'All your documents have been received. The team will be in touch about your onboarding.'
        : `${spec.label} uploaded. ${state.total - state.uploaded} document(s) still to go.`,
    ), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
