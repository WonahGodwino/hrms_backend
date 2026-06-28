// src/app/api/offers/[id]/route.ts
// GET /api/offers/:id — fetch an offer's current state (status, documents,
// workflow settings). Lets the frontend reload an ad-hoc offer after refresh.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { readOfferMetadata, buildOfferDocumentUrl } from '@/app/lib/offers/ad-hoc-helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }
    const companyId = String(user.companyId)

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
        onboarding: { select: { id: true, status: true } },
      },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const meta = readOfferMetadata(offer.metadata)
    const fullName = `${offer.candidate.firstName} ${offer.candidate.lastName}`.trim()

    return withCors(
      ApiResponse.success(
        {
          offerId: offer.id,
          candidateId: offer.candidate.id,
          name: fullName,
          email: offer.candidate.email,
          applicationId: offer.applicationId,
          status: meta.displayStatus || offer.status,
          rawStatus: offer.status,
          isAdHoc: !!meta.isAdHoc,
          workflowSettings: {
            trackSignature: !!meta.trackSignature,
            initiateOnboarding: !!meta.initiateOnboarding,
          },
          dispatch: meta.dispatchMethod
            ? { method: meta.dispatchMethod, dispatchedAt: meta.dispatchedAt || offer.sentAt }
            : null,
          document: offer.offerLetterName
            ? {
                fileName: offer.offerLetterName,
                url: buildOfferDocumentUrl(request.url, offer.id, 'offer'),
              }
            : null,
          executedDocument: meta.executedDocument
            ? {
                ...meta.executedDocument,
                url: buildOfferDocumentUrl(request.url, offer.id, 'signed'),
              }
            : null,
          onboarding: offer.onboarding,
          createdAt: offer.createdAt,
        },
        'Offer retrieved successfully.'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
