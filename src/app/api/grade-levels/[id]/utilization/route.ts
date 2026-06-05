// src/app/api/grade-levels/[id]/utilization/route.ts
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { GradeLevelService } from '@/app/lib/services/grade-level.service'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const origin = request.headers.get('origin')
  
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN', 'MANAGER'])

    let companyId = user.companyId
    
    if (!companyId && user.role === 'SUPER_ADMIN') {
      const url = new URL(request.url)
      companyId = url.searchParams.get('companyId') || ''
      if (!companyId) {
        return withCors(ApiResponse.error('Company ID required for SUPER_ADMIN', 400), origin)
      }
    }
    
    if (!companyId) {
      return withCors(ApiResponse.error('No company access found', 403), origin)
    }

    const service = new GradeLevelService(companyId, user.userId, user.role)
    const utilization = await service.getUtilization(params.id)
    
    return withCors(ApiResponse.success(utilization), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}