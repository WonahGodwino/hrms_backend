// src/app/api/grade-levels/create/route.ts
import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { GradeLevelService } from '@/app/lib/services/grade-level.service'

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
    const user = await requireRoleAsync(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])
    const body = await request.json()

    // Resolve companyId from the global selector (body) first, then fall back
    // to the value stored in the JWT at login time.  The global selector lets
    // users switch companies without re-authenticating, so the body value is
    // the authoritative source of which company they are currently acting on.
    let companyId = body.companyId || user.companyId

    // SUPER_ADMIN without a default company still needs an explicit companyId
    if (!companyId && user.role === 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('Company ID required for SUPER_ADMIN', 400), origin)
    }

    // Verify the resolved company is actually in the user's accessible set
    if (!companyId) {
      return withCors(ApiResponse.error('No company access found', 403), origin)
    }
    if (user.companyIds && !user.companyIds.includes(companyId)) {
      return withCors(ApiResponse.error('You do not have access to the selected company', 403), origin)
    }

    const service = new GradeLevelService(companyId, user.userId, user.role)
    const grade = await service.createGrade({
      name: body.name,
      rank: body.rank,
      summary: body.summary
    })
    
    return withCors(ApiResponse.success(grade, 'Grade level created successfully'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}