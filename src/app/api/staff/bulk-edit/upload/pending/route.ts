// src/app/api/staff/bulk-edit/upload/pending/route.ts
//
// GET /api/staff/bulk-edit/upload/pending?companyId=
//
// Lets the frontend discover an in-flight staff bulk-edit upload for the
// current company on page load/refresh (e.g. to resume polling after
// navigating away), and is also what the upload flow checks before allowing
// a new upload to start.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getActiveStaffBulkEditUpload } from '@/app/lib/staff/bulkEditUploadStatus'

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
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const companyId = request.nextUrl.searchParams.get('companyId')
    if (!companyId) {
      return withCors(ApiResponse.error('Company selection is required', 400), origin)
    }

    if (authUser.role === 'HR') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: { userId: authUser.userId, companyId, role: { in: ['HR', 'ALL'] } },
      })
      if (!hasAccess) {
        return withCors(ApiResponse.error('You do not have HR access for this company', 403), origin)
      }
    } else if (authUser.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: { userId: authUser.userId, companyId, role: { in: ['ADMIN', 'ALL'] } },
      })
      if (!hasAccess) {
        return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
      }
    }

    const active = await getActiveStaffBulkEditUpload(companyId)

    return withCors(
      ApiResponse.success(
        active ? { active: true, uploadId: active.id, status: active.status } : { active: false },
        active ? 'A staff bulk-edit upload is in progress' : 'No staff bulk-edit upload in progress'
      ),
      origin
    )
  } catch (error) {
    console.error('[STAFF_BULK_EDIT_PENDING] Error:', error)
    return withCors(handleApiError(error), origin)
  }
}
