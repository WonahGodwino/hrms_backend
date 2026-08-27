// src/app/api/offer-letters/email-templates/route.ts
//
// GET  — list email templates for a company.
// POST — create a new email template (From/CC/BCC/Subject/Body/Signature).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const companyId = request.nextUrl.searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    const isActive = request.nextUrl.searchParams.get('isActive')
    const where: any = { companyId }
    if (isActive === 'true') where.isActive = true
    if (isActive === 'false') where.isActive = false

    const templates = await prisma.offerLetterEmailTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return withCors(ApiResponse.success({ items: templates }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await request.json()
    const {
      companyId,
      name,
      description,
      ccEmails,
      bccEmails,
      subject,
      body: emailBody,
      signatureHtml,
      autoAttachLetter,
    }: {
      companyId?: string
      name?: string
      description?: string
      ccEmails?: string[]
      bccEmails?: string[]
      subject?: string
      body?: string
      signatureHtml?: string
      autoAttachLetter?: boolean
    } = body

    if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)
    if (!name?.trim()) return withCors(ApiResponse.error('Template name is required', 400), origin)
    if (!subject?.trim()) return withCors(ApiResponse.error('Subject is required', 400), origin)
    if (!emailBody?.trim()) return withCors(ApiResponse.error('Body is required', 400), origin)

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    const template = await prisma.offerLetterEmailTemplate.create({
      data: {
        companyId,
        name: name.trim(),
        description: description?.trim() || null,
        ccEmails: ccEmails && ccEmails.length ? ccEmails : undefined,
        bccEmails: bccEmails && bccEmails.length ? bccEmails : undefined,
        subject: subject.trim(),
        body: emailBody,
        signatureHtml: signatureHtml || null,
        autoAttachLetter: autoAttachLetter ?? true,
        createdBy: user.userId,
      },
    })

    return withCors(ApiResponse.success(template, 'Email template created'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
