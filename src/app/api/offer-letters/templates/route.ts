// src/app/api/offer-letters/templates/route.ts
//
// GET  — paginated list of a company's offer letter templates.
// POST — upload a master .docx sample. The original bytes are stored
// byte-for-byte (the layout source of truth) and every {{variable}}
// placeholder in the body/headers/footers is detected and stored separately.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import { extractVariables } from '@/app/lib/offer-letters/docxTemplate'

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
    const status = request.nextUrl.searchParams.get('status')

    const where: any = { companyId, archived: 0 }
    if (status) where.status = status

    const [items, total] = await Promise.all([
      prisma.offerLetterTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          originalFileName: true,
          fileSize: true,
          variables: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.offerLetterTemplate.count({ where }),
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

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const companyId = formData.get('companyId') as string | null
    const name = (formData.get('name') as string | null) || ''
    const description = (formData.get('description') as string | null) || null

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }
    if (!name.trim()) {
      return withCors(ApiResponse.error('Template name is required', 400), origin)
    }
    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (fileExtension !== 'docx') {
      return withCors(
        ApiResponse.error('Only Word (.docx) files are supported for offer letter templates.', 400),
        origin
      )
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    let variables: string[]
    try {
      variables = extractVariables(bytes)
    } catch (parseError) {
      console.error('[OFFER_LETTER_TEMPLATE_UPLOAD] Failed to parse .docx:', parseError)
      return withCors(
        ApiResponse.error('Could not read this file. Please make sure it is a valid, uncorrupted Word (.docx) document.', 400),
        origin
      )
    }

    if (variables.length === 0) {
      return withCors(
        ApiResponse.error('No {{variable}} placeholders were found in this document. Add at least one, e.g. {{recipient_name}}.', 400),
        origin
      )
    }

    const template = await prisma.offerLetterTemplate.create({
      data: {
        companyId,
        name: name.trim(),
        description,
        originalFileName: file.name,
        fileData: bytes as any,
        fileSize: bytes.length,
        variables,
        createdBy: user.userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        originalFileName: true,
        fileSize: true,
        variables: true,
        status: true,
        createdAt: true,
      },
    })

    return withCors(ApiResponse.success(template, 'Template uploaded — variables detected'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
