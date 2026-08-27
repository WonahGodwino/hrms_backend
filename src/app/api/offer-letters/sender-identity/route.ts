// src/app/api/offer-letters/sender-identity/route.ts
//
// GET — returns the configured SMTP sender name and email for one
// company's offer-letter mailbox. Used by the frontend to display the
// "From" field in the email composer as a read-only reference. The actual
// sender is always set on the backend to prevent spoofing.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import { getOfferLetterSenderIdentity } from '@/app/lib/offer-letters/email/transport'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)

    const companyId = request.nextUrl.searchParams.get('companyId')
    if (!companyId) return withCors(ApiResponse.error('Company selection is required', 400), origin)

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'OFFER_LETTERS', ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const hasAccess = await validateOfferLetterCompanyAccess(user, companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this company', 403), origin)

    const identity = await getOfferLetterSenderIdentity(companyId)

    return withCors(ApiResponse.success(identity), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
