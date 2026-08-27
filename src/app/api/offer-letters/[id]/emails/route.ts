// src/app/api/offer-letters/[id]/emails/route.ts
//
// GET — the email thread for one offer letter. letterId is the thread key
// (one candidate per generated letter), ordered chronologically.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const emails = await prisma.offerLetterEmail.findMany({
      where: { letterId: id, companyId: letter.companyId },
      orderBy: { createdAt: 'asc' },
      include: {
        attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true, source: true } },
      },
    })

    const unreadCount = emails.filter((e) => e.direction === 'INBOUND' && !e.isRead).length

    return withCors(ApiResponse.success({ items: emails, unreadCount }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
