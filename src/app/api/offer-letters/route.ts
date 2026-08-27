// src/app/api/offer-letters/route.ts
//
// GET  — paginated list of generated offer letters for a company.
// POST — generate one letter from a template: loads the template's master
// .docx bytes fresh, substitutes only the {{variable}} placeholders, and
// stores the resulting .docx as its own record. Synchronous — single-letter
// generation is fast; async/polling is reserved for bulk file uploads.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import { renderDocx, MissingOfferLetterVariableError } from '@/app/lib/offer-letters/docxTemplate'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const companyId = request.nextUrl.searchParams.get('companyId')
    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20', 10)))
    const month = request.nextUrl.searchParams.get('month')
    const year = request.nextUrl.searchParams.get('year')
    const templateId = request.nextUrl.searchParams.get('templateId')
    const search = request.nextUrl.searchParams.get('search')

    const where: any = { companyId }
    if (month) where.month = month
    if (year) where.year = parseInt(year, 10)
    if (templateId) where.templateId = templateId
    if (search) {
      where.OR = [
        { recipientName: { contains: search, mode: 'insensitive' } },
        { recipientEmail: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.generatedOfferLetter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          templateId: true,
          recipientName: true,
          recipientEmail: true,
          month: true,
          year: true,
          fileName: true,
          fileSize: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          template: { select: { id: true, name: true } },
        },
      }),
      prisma.generatedOfferLetter.count({ where }),
    ])

    return withCors(
      ApiResponse.success({
        items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await request.json()
    const {
      companyId,
      templateId,
      recipientName,
      recipientEmail,
      month,
      year,
      variableValues,
    }: {
      companyId?: string
      templateId?: string
      recipientName?: string
      recipientEmail?: string
      month?: string
      year?: number | string
      variableValues?: Record<string, string>
    } = body

    if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)
    if (!templateId) return withCors(ApiResponse.error('A template is required', 400), origin)
    if (!recipientName?.trim()) return withCors(ApiResponse.error('Recipient name is required', 400), origin)
    if (!recipientEmail?.trim()) return withCors(ApiResponse.error('Recipient email is required', 400), origin)
    if (!month) return withCors(ApiResponse.error('Month is required', 400), origin)

    const yearNumber = typeof year === 'string' ? parseInt(year, 10) : year
    if (!yearNumber || Number.isNaN(yearNumber)) {
      return withCors(ApiResponse.error('A valid year is required', 400), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const template = await prisma.offerLetterTemplate.findFirst({
      where: { id: templateId, companyId },
    })
    if (!template) {
      return withCors(ApiResponse.error('Template not found for this company', 404), origin)
    }

    const values = variableValues || {}
    const templateVariables = (template.variables as string[]) || []
    const missing = templateVariables.filter((key) => values[key] === undefined || values[key] === null || values[key] === '')
    if (missing.length > 0) {
      return withCors(
        ApiResponse.error(`Missing values for: ${missing.join(', ')}`, 400),
        origin
      )
    }

    let generatedBytes: Buffer
    try {
      generatedBytes = renderDocx(template.fileData as Buffer, values)
    } catch (renderError) {
      if (renderError instanceof MissingOfferLetterVariableError) {
        return withCors(ApiResponse.error(renderError.message, 400), origin)
      }
      console.error('[OFFER_LETTER_CREATE] Render error:', renderError)
      return withCors(ApiResponse.error('Failed to generate the letter from this template.', 500), origin)
    }

    const safeName = recipientName.trim().replace(/[^a-zA-Z0-9]+/g, '_')
    const fileName = `${safeName}-${month}-${yearNumber}.docx`

    const letter = await prisma.generatedOfferLetter.create({
      data: {
        companyId,
        templateId,
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail.trim(),
        variableValues: values,
        fileData: generatedBytes as any,
        fileName,
        fileSize: generatedBytes.length,
        month,
        year: yearNumber,
        createdBy: user.userId,
      },
      select: {
        id: true,
        templateId: true,
        recipientName: true,
        recipientEmail: true,
        month: true,
        year: true,
        fileName: true,
        fileSize: true,
        status: true,
        createdAt: true,
      },
    })

    return withCors(ApiResponse.success(letter, 'Offer letter generated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
