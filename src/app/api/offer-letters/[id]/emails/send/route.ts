// src/app/api/offer-letters/[id]/emails/send/route.ts
//
// POST — compose-and-send an offer-letter email. Synchronous (a single send
// is fast — no async/polling needed, matching the single-letter-generate
// route's own reasoning). Accepts multipart form data so HR can attach
// extra files from their own machine alongside the auto-attached letter.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import { sendOfferLetterEmail } from '@/app/lib/offer-letters/email/sendEmail'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const letter = await prisma.generatedOfferLetter.findUnique({ where: { id }, select: { companyId: true } })
    if (!letter) return withCors(ApiResponse.error('Offer letter not found', 404), origin)

    const hasAccess = await validateOfferLetterCompanyAccess(user, letter.companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    const formData = await request.formData()
    const templateId = (formData.get('templateId') as string) || null
    const subject = (formData.get('subject') as string) || undefined
    const body = (formData.get('body') as string) || undefined
    const toEmail = (formData.get('toEmail') as string) || undefined
    const toName = (formData.get('toName') as string) || undefined
    const ccEmailsRaw = (formData.get('ccEmails') as string) || ''
    const bccEmailsRaw = (formData.get('bccEmails') as string) || ''
    const autoAttachLetterRaw = formData.get('autoAttachLetter') as string | null

    const ccEmails = ccEmailsRaw ? ccEmailsRaw.split(',').map((e) => e.trim()).filter(Boolean) : undefined
    const bccEmails = bccEmailsRaw ? bccEmailsRaw.split(',').map((e) => e.trim()).filter(Boolean) : undefined
    const autoAttachLetterOverride = autoAttachLetterRaw === null ? undefined : autoAttachLetterRaw === 'true'

    const fileEntries = formData.getAll('attachments') as File[]
    const extraAttachments = await Promise.all(
      fileEntries
        .filter((f) => f && typeof f.arrayBuffer === 'function')
        .map(async (f) => ({
          fileName: f.name,
          mimeType: f.type || 'application/octet-stream',
          data: Buffer.from(await f.arrayBuffer()),
        }))
    )

    const emailRow = await sendOfferLetterEmail({
      letterId: id,
      companyId: letter.companyId,
      templateId,
      subjectOverride: subject,
      bodyOverride: body,
      toEmailOverride: toEmail,
      toNameOverride: toName,
      ccEmails,
      bccEmails,
      autoAttachLetterOverride,
      extraAttachments,
      userId: user.userId,
    })

    if (emailRow.status === 'FAILED') {
      return withCors(ApiResponse.error(emailRow.errorMessage || 'Failed to send email', 502), origin)
    }

    return withCors(ApiResponse.success(emailRow, 'Email sent'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
