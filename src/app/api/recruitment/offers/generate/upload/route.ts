// POST /api/recruitment/offers/generate/upload — create an offer draft in Upload
// mode by attaching a pre-negotiated/custom offer PDF instead of the template builder.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { readPdfUpload } from '@/app/lib/offers/ad-hoc-helpers'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

const MAX_BYTES = 10 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function toBool(v: unknown): boolean {
  return String(v ?? '').trim().toLowerCase() === 'true' || v === true
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const candidateId = String(formData.get('candidateId') || '').trim()
    const jobId = String(formData.get('jobId') || '').trim()
    const isPreApproved = toBool(formData.get('isPreApproved'))
    const anticipatedStartDate = String(formData.get('anticipatedStartDate') || '').trim()
    const offerExpirationDate = String(formData.get('offerExpirationDate') || '').trim()

    if (!candidateId || !jobId || !file)
      return withCors(ApiResponse.error('candidateId, jobId, and file are required', 400), origin)

    // Size check first → 413; type check via helper → 415.
    if (file.size > MAX_BYTES)
      return withCors(ApiResponse.error('File exceeds the maximum allowed size of 10MB', 413), origin)

    const pdf = await readPdfUpload(file, { maxBytes: MAX_BYTES })
    if ('error' in pdf)
      return withCors(ApiResponse.error('Unsupported file type. Only PDF documents are accepted', 415), origin)

    const application = await prisma.jobApplication.findFirst({
      where: { candidateId, jobId, companyId },
      include: { offer: true },
    })
    if (!application) return withCors(ApiResponse.error('Application not found', 404), origin)
    if (application.offer)
      return withCors(ApiResponse.error('An offer already exists for this application', 409), origin)

    const status = isPreApproved ? 'APPROVED' : 'PENDING_APPROVAL'
    const displayStatus = isPreApproved ? 'READY_TO_SEND' : 'PENDING_APPROVAL'

    const created = await prisma.$transaction(async (tx) => {
      const offerFile = await tx.candidateFile.create({
        data: {
          companyId,
          candidateId,
          applicationId: application.id,
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
          candidateId,
          applicationId: application.id,
          jobId,
          status,
          offerLetterName: pdf.name,
          offerLetterPath: offerFile.id,
          proposedStartDate: anticipatedStartDate ? new Date(anticipatedStartDate) : null,
          createdBy: actor,
          metadata: {
            configMode: 'UPLOAD',
            isPreApproved,
            displayStatus,
            offerFileId: offerFile.id,
            documentName: pdf.name,
            documentSize: formatSize(pdf.size),
            ...(offerExpirationDate ? { offerExpirationDate } : {}),
          } as any,
        },
      })

      return { offer, offerFile }
    })

    const message = isPreApproved
      ? 'Pre-approved offer document uploaded. Internal routing skipped.'
      : 'Offer document uploaded and routed for internal approval.'

    return withCors(ApiResponse.success({
      offerId: created.offer.id,
      status: displayStatus,
      documentName: created.offerFile.fileName,
      documentSize: formatSize(created.offerFile.sizeBytes),
    }, message, 201), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
