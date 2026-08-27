// src/app/api/offer-letters/bulk-jobs/pending/route.ts
//
// GET /api/offer-letters/bulk-jobs/pending?companyId=
// Lets the frontend discover an in-flight bulk job (create or edit) for the
// current company on load/refresh, and is what both upload actions check
// before allowing a new job to start — only one bulk job may run per
// company at a time.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateOfferLetterCompanyAccess } from '@/app/lib/offer-letters/access'
import { getActiveOfferLetterBulkJob } from '@/app/lib/offer-letters/bulkJobStatus'

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

    const active = await getActiveOfferLetterBulkJob(companyId)

    return withCors(
      ApiResponse.success(
        active ? { active: true, jobId: active.id, jobType: active.jobType, status: active.status } : { active: false },
        active ? 'A bulk job is in progress' : 'No bulk job in progress'
      ),
      origin
    )
  } catch (error) {
    console.error('[OFFER_LETTER_BULK_JOB_PENDING] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
