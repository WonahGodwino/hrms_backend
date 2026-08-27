// src/app/api/payroll/upload/pending/route.ts
import { NextRequest } from 'next/server'

import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getActivePayrollUpload, validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/payroll/upload/pending?companyId=
 *
 * Lets the frontend discover an in-flight upload for the current company on
 * page load/refresh (e.g. to resume polling after navigating away), and is
 * also what the upload modal checks before allowing a new upload to start.
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const companyId = request.nextUrl.searchParams.get('companyId')
    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const active = await getActivePayrollUpload(companyId)

    return withCors(
      ApiResponse.success(
        active ? { active: true, uploadId: active.id, status: active.status } : { active: false },
        active ? 'A payroll upload is in progress' : 'No payroll upload in progress'
      ),
      origin
    )
  } catch (error) {
    console.error('[PAYROLL_UPLOAD_PENDING] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
