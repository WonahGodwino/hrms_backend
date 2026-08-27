// src/app/api/offer-letters/emails/[emailId]/attachments/[attachmentId]/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string; attachmentId: string }> }
) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { emailId, attachmentId } = await params

    const attachment = await prisma.offerLetterEmailAttachment.findFirst({
      where: { id: attachmentId, emailId },
      include: { email: { select: { companyId: true } } },
    })
    if (!attachment) return withCors(ApiResponse.error('Attachment not found', 404), origin)

    const hasAccess = await validateOfferLetterCompanyAccess(user, attachment.email.companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    return withCors(
      new NextResponse(attachment.fileData as any, {
        status: 200,
        headers: {
          'Content-Type': attachment.mimeType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${attachment.fileName}"`,
          'Cache-Control': 'private, no-cache',
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
