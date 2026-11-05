// src/app/api/staff-loans-benefits/access-config/my-access/route.ts
// GET — which of the five governed admin pages the calling user can
// currently access, in one call. Consumed by the frontend AuthContext to
// back both ModulePageAccessRoute and the Sidebar's nav visibility.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveAccessiblePages } from '@/app/lib/staff-loans-benefits/page-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const accessiblePages = await resolveAccessiblePages(user)
    return withCors(ApiResponse.success({ accessiblePages }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
