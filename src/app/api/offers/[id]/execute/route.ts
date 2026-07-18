// src/app/api/offers/[id]/execute/route.ts
// POST /api/offers/:id/execute
// Uploads the fully signed/executed contract, finalizing the offer phase. The
// response echoes initiateOnboarding so the frontend knows whether to trigger
// the onboarding handoff or simply close the workflow loop.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { OFFER_DISPLAY_STATUS, readOfferMetadata, readPdfUpload } from '@/app/lib/offers/ad-hoc-helpers'

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

    const formData = await request.formData()
    const pdf = await readPdfUpload(formData.get('file') as File | null)
    if ('error' in pdf) return withCors(ApiResponse.error(pdf.error, 400), origin)

    // Resolve companyId: global selector (formData) > JWT
    const formCompanyId = (formData.get('companyId') as string | null) || undefined
    const companyId = formCompanyId || String(user.companyId)
    const actor = user.userId || user.email || 'system'

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
      select: { id: true, candidateId: true, applicationId: true, metadata: true, status: true },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const meta = readOfferMetadata(offer.metadata)
    const initiateOnboarding = !!meta.initiateOnboarding
    const uploadedAt = new Date()

    const executedDocument = {
      fileName: pdf.name,
      size: pdf.size,
      uploadedAt: uploadedAt.toISOString(),
    }

    await prisma.$transaction(async (tx) => {
      // Store the signed contract bytes
      const signedFile = await tx.candidateFile.create({
        data: {
          companyId,
          candidateId: offer.candidateId,
          applicationId: offer.applicationId,
          type: 'OTHER',
          fileName: pdf.name,
          mimeType: pdf.mime,
          sizeBytes: pdf.size,
          data: new Uint8Array(pdf.buffer),
          createdBy: actor,
        },
      })

      // Finalize the offer
      await tx.offer.update({
        where: { id: offer.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: uploadedAt,
          updatedBy: actor,
          metadata: {
            ...meta,
            displayStatus: OFFER_DISPLAY_STATUS.ACCEPTED,
            executedFileId: signedFile.id,
            executedDocument,
          },
        },
      })

      // Reflect acceptance on the application
      await tx.jobApplication.update({
        where: { id: offer.applicationId },
        data: { status: 'HIRED', updatedBy: actor },
      })

      // If onboarding was requested, prepare the handoff record (idempotent)
      if (initiateOnboarding) {
        await tx.onboarding.upsert({
          where: { offerId: offer.id },
          update: {},
          create: { companyId, offerId: offer.id, status: 'IN_PROGRESS', createdBy: actor },
        })
      }
    })

    return withCors(
      ApiResponse.success(
        {
          offerId: offer.id,
          status: OFFER_DISPLAY_STATUS.ACCEPTED,
          executedDocument,
          initiateOnboarding,
          nextStep: initiateOnboarding ? 'onboarding_ready' : 'completed',
        },
        initiateOnboarding
          ? 'Executed contract uploaded. Ready for Core HR Onboarding.'
          : 'Executed contract uploaded. Workflow loop closed.'
      ),
      origin
    )
  } catch (error) {
    console.error('❌ Offer execute error:', error)
    return withCors(handleApiError(error), origin)
  }
}
