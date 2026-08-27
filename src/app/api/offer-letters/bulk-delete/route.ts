// src/app/api/offer-letters/bulk-delete/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
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
    const { companyId, ids }: { companyId?: string; ids?: string[] } = body

    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return withCors(ApiResponse.error('Please provide at least one offer letter id to delete', 400), origin)
    }

    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const result = await prisma.generatedOfferLetter.deleteMany({
      where: { id: { in: ids }, companyId },
    })

    return withCors(
      ApiResponse.success({ deletedCount: result.count }, `${result.count} offer letter(s) deleted`),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
