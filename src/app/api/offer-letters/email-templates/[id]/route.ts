// src/app/api/offer-letters/email-templates/[id]/route.ts
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

    const template = await prisma.offerLetterEmailTemplate.findUnique({ where: { id } })
    if (!template) return withCors(ApiResponse.error('Email template not found', 404), origin)

    const hasAccess = await validateOfferLetterCompanyAccess(user, template.companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    return withCors(ApiResponse.success(template), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const existing = await prisma.offerLetterEmailTemplate.findUnique({ where: { id } })
    if (!existing) return withCors(ApiResponse.error('Email template not found', 404), origin)

    const hasAccess = await validateOfferLetterCompanyAccess(user, existing.companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    const body = await request.json()
    const { name, description, ccEmails, bccEmails, subject, body: emailBody, signatureHtml, autoAttachLetter, isActive } = body

    const updated = await prisma.offerLetterEmailTemplate.update({
      where: { id },
      data: {
        name: name?.trim() ?? existing.name,
        description: description !== undefined ? description?.trim() || null : existing.description,
        ccEmails: ccEmails !== undefined ? (ccEmails.length ? ccEmails : null) : existing.ccEmails,
        bccEmails: bccEmails !== undefined ? (bccEmails.length ? bccEmails : null) : existing.bccEmails,
        subject: subject?.trim() ?? existing.subject,
        body: emailBody ?? existing.body,
        signatureHtml: signatureHtml !== undefined ? signatureHtml || null : existing.signatureHtml,
        autoAttachLetter: autoAttachLetter ?? existing.autoAttachLetter,
        isActive: isActive ?? existing.isActive,
        updatedBy: user.userId,
      },
    })

    return withCors(ApiResponse.success(updated, 'Email template updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const existing = await prisma.offerLetterEmailTemplate.findUnique({ where: { id } })
    if (!existing) return withCors(ApiResponse.error('Email template not found', 404), origin)

    const hasAccess = await validateOfferLetterCompanyAccess(user, existing.companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    // Emails already sent using this template reference it via onDelete:
    // SetNull, so history is preserved — hard delete is safe here.
    await prisma.offerLetterEmailTemplate.delete({ where: { id } })

    return withCors(ApiResponse.success(null, 'Email template deleted'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
