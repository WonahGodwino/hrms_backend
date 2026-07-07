// src/app/api/offers/ad-hoc/route.ts
// POST /api/offers/ad-hoc
// Creates a stub candidate + job application and attaches a pre-drafted external
// offer PDF, bypassing the standard drafting/approval stages. The offer is left
// "Ready to Send" for a subsequent /dispatch call.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import {
  OFFER_DISPLAY_STATUS,
  readPdfUpload,
  splitName,
  buildOfferDocumentUrl,
} from '@/app/lib/offers/ad-hoc-helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function toBool(v: unknown): boolean {
  return String(v ?? '').trim().toLowerCase() === 'true' || v === true
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }
    const companyId = String(user.companyId)
    const actor = user.userId || user.email || 'system'

    // 1. Parse multipart form
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const candidateName = String(formData.get('candidateName') || '').trim()
    const candidateEmail = String(formData.get('candidateEmail') || '').toLowerCase().trim()
    const jobId = String(formData.get('jobId') || '').trim()
    const trackSignature = toBool(formData.get('trackSignature'))
    const initiateOnboarding = toBool(formData.get('initiateOnboarding'))

    // 2. Validate
    if (!candidateName) return withCors(ApiResponse.error('candidateName is required', 400), origin)
    if (!candidateEmail || !EMAIL_RE.test(candidateEmail)) {
      return withCors(ApiResponse.error('A valid candidateEmail is required', 400), origin)
    }
    if (!jobId) return withCors(ApiResponse.error('jobId is required', 400), origin)

    const pdf = await readPdfUpload(file)
    if ('error' in pdf) return withCors(ApiResponse.error(pdf.error, 400), origin)

    // 3. Verify the job belongs to this company
    const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true } })
    if (!job) return withCors(ApiResponse.error('Job not found for this company', 404), origin)

    const { firstName, lastName } = splitName(candidateName)

    // 4. Create everything atomically
    const created = await prisma.$transaction(async (tx) => {
      // Stub candidate (reuse if one already exists for this email + company)
      let candidate = await tx.candidate.findFirst({ where: { email: candidateEmail, companyId } })
      if (!candidate) {
        candidate = await tx.candidate.create({
          data: { companyId, firstName, lastName, email: candidateEmail, createdBy: actor },
        })
      }

      // Stub application for this job (one application per job+candidate)
      let application = await tx.jobApplication.findUnique({
        where: { jobId_candidateId: { jobId, candidateId: candidate.id } },
        include: { offer: true },
      })

      if (application?.offer) {
        throw Object.assign(new Error('An offer already exists for this candidate and job'), {
          statusCode: 409,
        })
      }

      if (!application) {
        application = await tx.jobApplication.create({
          data: {
            companyId,
            jobId,
            candidateId: candidate.id,
            cvFilePath: 'ad-hoc-direct-offer',
            status: 'OFFERED',
            createdBy: actor,
            metadata: { source: 'AD_HOC_DIRECT_OFFER' },
          },
          include: { offer: true },
        }) as any
      } else {
        await tx.jobApplication.update({
          where: { id: application.id },
          data: { status: 'OFFERED', updatedBy: actor },
        })
      }

      // Persist the offer PDF as a candidate file (DB-stored bytes)
      const offerFile = await tx.candidateFile.create({
        data: {
          companyId,
          candidateId: candidate.id,
          applicationId: application!.id,
          type: 'OTHER',
          fileName: pdf.name,
          mimeType: pdf.mime,
          sizeBytes: pdf.size,
          data: new Uint8Array(pdf.buffer),
          createdBy: actor,
        },
      })

      const offer = await tx.offer.create({
        data: {
          companyId,
          applicationId: application!.id,
          candidateId: candidate.id,
          status: 'DRAFT',
          offerLetterName: pdf.name,
          offerLetterPath: offerFile.id,
          createdBy: actor,
          metadata: {
            isAdHoc: true,
            trackSignature,
            initiateOnboarding,
            displayStatus: OFFER_DISPLAY_STATUS.READY_TO_SEND,
            offerFileId: offerFile.id,
          },
        },
      })

      return { candidate, offer, offerFile }
    })

    // 5. Respond
    return withCors(
      ApiResponse.success(
        {
          offerId: created.offer.id,
          candidateId: created.candidate.id,
          name: candidateName,
          email: candidateEmail,
          status: OFFER_DISPLAY_STATUS.READY_TO_SEND,
          document: {
            fileName: created.offerFile.fileName,
            size: created.offerFile.sizeBytes,
            url: buildOfferDocumentUrl(request.url, created.offer.id, 'offer'),
          },
          workflowSettings: { trackSignature, initiateOnboarding },
        },
        'Ad-Hoc offer profile generated successfully.'
      ),
      origin
    )
  } catch (error: any) {
    if (error?.statusCode === 409) {
      return withCors(ApiResponse.error(error.message, 409), origin)
    }
    console.error('❌ Ad-hoc offer error:', error)
    return withCors(handleApiError(error), origin)
  }
}
