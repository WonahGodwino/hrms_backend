// src/app/api/offer-letters/[id]/route.ts
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

    const letter = await prisma.generatedOfferLetter.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        templateId: true,
        recipientName: true,
        recipientEmail: true,
        variableValues: true,
        month: true,
        year: true,
        fileName: true,
        fileSize: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        template: { select: { id: true, name: true, variables: true, status: true } },
      },
    })
    if (!letter) {
      return withCors(ApiResponse.error('Offer letter not found', 404), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, letter.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    return withCors(ApiResponse.success(letter), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const existing = await prisma.generatedOfferLetter.findUnique({
      where: { id },
      include: { template: true },
    })
    if (!existing) {
      return withCors(ApiResponse.error('Offer letter not found', 404), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, existing.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    if (!existing.template) {
      return withCors(
        ApiResponse.error('The template this letter was generated from no longer exists, so it cannot be regenerated.', 409),
        origin
      )
    }

    const body = await request.json()
    const {
      recipientName,
      recipientEmail,
      month,
      year,
      variableValues,
    }: {
      recipientName?: string
      recipientEmail?: string
      month?: string
      year?: number | string
      variableValues?: Record<string, string>
    } = body

    const mergedValues = { ...(existing.variableValues as Record<string, string>), ...(variableValues || {}) }
    const templateVariables = (existing.template.variables as string[]) || []
    const missing = templateVariables.filter((key) => mergedValues[key] === undefined || mergedValues[key] === null || mergedValues[key] === '')
    if (missing.length > 0) {
      return withCors(ApiResponse.error(`Missing values for: ${missing.join(', ')}`, 400), origin)
    }

    const finalMonth = month || existing.month
    const finalYear = year !== undefined ? (typeof year === 'string' ? parseInt(year, 10) : year) : existing.year
    if (!finalYear || Number.isNaN(finalYear)) {
      return withCors(ApiResponse.error('A valid year is required', 400), origin)
    }

    let generatedBytes: Buffer
    try {
      generatedBytes = renderDocx(existing.template.fileData as Buffer, mergedValues)
    } catch (renderError) {
      if (renderError instanceof MissingOfferLetterVariableError) {
        return withCors(ApiResponse.error(renderError.message, 400), origin)
      }
      console.error('[OFFER_LETTER_EDIT] Render error:', renderError)
      return withCors(ApiResponse.error('Failed to regenerate the letter.', 500), origin)
    }

    const safeName = (recipientName?.trim() || existing.recipientName).replace(/[^a-zA-Z0-9]+/g, '_')
    const fileName = `${safeName}-${finalMonth}-${finalYear}.docx`

    const updated = await prisma.$transaction(async (tx) => {
      return tx.generatedOfferLetter.update({
        where: { id },
        data: {
          recipientName: recipientName?.trim() || existing.recipientName,
          recipientEmail: recipientEmail?.trim() || existing.recipientEmail,
          variableValues: mergedValues,
          fileData: generatedBytes as any,
          fileName,
          fileSize: generatedBytes.length,
          month: finalMonth,
          year: finalYear,
          status: 'REGENERATED',
          updatedBy: user.userId,
        },
        select: {
          id: true,
          recipientName: true,
          recipientEmail: true,
          variableValues: true,
          month: true,
          year: true,
          fileName: true,
          fileSize: true,
          status: true,
          updatedAt: true,
        },
      })
    })

    return withCors(ApiResponse.success(updated, 'Offer letter updated'), origin)
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

    const letter = await prisma.generatedOfferLetter.findUnique({ where: { id }, select: { companyId: true } })
    if (!letter) {
      return withCors(ApiResponse.error('Offer letter not found', 404), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, letter.companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    await prisma.generatedOfferLetter.delete({ where: { id } })
    return withCors(ApiResponse.success(null, 'Offer letter deleted'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
