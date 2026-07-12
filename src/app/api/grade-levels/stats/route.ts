// src/app/api/grade-levels/stats/route.ts
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { GradeLevelService } from '@/app/lib/services/grade-level.service'
import { resolveScopedCompanyId } from '@/app/lib/company-scope'

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
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN', 'STAFF'])

    // Scope stats to the globally selected company (companyId param).
    const scope = await resolveScopedCompanyId(user, new URL(request.url).searchParams.get('companyId'))
    if (scope.forbidden) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }
    const companyId = scope.companyId
    if (!companyId) {
      return withCors(ApiResponse.error('Company ID is required', 400), origin)
    }

    const service = new GradeLevelService(companyId, user.userId, user.role)
    const stats = await service.getStats()
    
    return withCors(ApiResponse.success(stats), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}