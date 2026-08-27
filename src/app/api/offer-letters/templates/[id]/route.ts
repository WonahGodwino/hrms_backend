// src/app/api/offer-letters/templates/[id]/route.ts
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
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const template = await prisma.offerLetterTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        name: true,
        description: true,
        originalFileName: true,
        fileSize: true,
        variables: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!template) {
      return withCors(ApiResponse.error('Template not found', 404), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, template.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    return withCors(ApiResponse.success(template), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const template = await prisma.offerLetterTemplate.findUnique({ where: { id }, select: { companyId: true } })
    if (!template) {
      return withCors(ApiResponse.error('Template not found', 404), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, template.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    // A template already used to generate letters is archived rather than
    // hard-deleted, so existing GeneratedOfferLetter rows keep a stable
    // reference for as long as possible; an unused one is safe to remove.
    const usageCount = await prisma.generatedOfferLetter.count({ where: { templateId: id } })
    if (usageCount > 0) {
      await prisma.offerLetterTemplate.update({
        where: { id },
        data: { status: 'ARCHIVED', archived: 1, updatedBy: user.userId },
      })
      return withCors(ApiResponse.success(null, 'Template archived — it has generated letters attached'), origin)
    }

    await prisma.offerLetterTemplate.delete({ where: { id } })
    return withCors(ApiResponse.success(null, 'Template deleted'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
