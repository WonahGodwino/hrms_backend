// src/app/api/recruitment/access-config/my-access/route.ts
// GET — which Recruitment pageKeys the calling user can currently access,
// in one call. Consumed by the frontend AuthContext to back nav visibility
// and any future route guard.
//
// Returns two lists because Recruitment scoping is opt-in (unlike Staff
// Loans & Benefits' "locked down until configured" default):
//   - accessiblePages: configured pageKeys this user passes
//   - restrictedPages: configured pageKeys this user does NOT pass
// A pageKey absent from BOTH lists was never configured and is therefore
// unrestricted — the frontend treats that as "allowed" by default.
import { NextRequest } from 'next/server'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveAccessibleRecruitmentPages, listConfiguredRecruitmentPageKeys } from '@/app/lib/recruitment/page-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])

    const [accessiblePages, configuredPages] = await Promise.all([
      resolveAccessibleRecruitmentPages(user),
      listConfiguredRecruitmentPageKeys(user.companyId),
    ])
    const restrictedPages = configuredPages.filter((key) => !accessiblePages.includes(key))

    return withCors(ApiResponse.success({ accessiblePages, restrictedPages }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
