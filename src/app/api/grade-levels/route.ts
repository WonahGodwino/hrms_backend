// src/app/api/grade-levels/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
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

    const { searchParams } = new URL(request.url)

    // Scope to the globally selected company (companyId param), honouring role
    // access. A concrete company is required to read grade levels.
    const scope = await resolveScopedCompanyId(user, searchParams.get('companyId'))
    if (scope.forbidden) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }
    const companyId = scope.companyId
    if (!companyId) {
      return withCors(ApiResponse.error('Company ID is required', 400), origin)
    }

    const search = searchParams.get('search') || undefined
    const status = searchParams.get('status') || undefined
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    
    const service = new GradeLevelService(companyId, user.userId, user.role)
    const result = await service.getAllGrades({ search, status, page, limit })
    
    return withCors(ApiResponse.success(result), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}