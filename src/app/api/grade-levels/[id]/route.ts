// src/app/api/grade-levels/[id]/route.ts
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { GradeLevelService } from '@/app/lib/services/grade-level.service'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(
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
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    // Get company ID from user context or request
    let companyId = user.companyId
    const body = await request.json()
    
    if (!companyId && user.role === 'SUPER_ADMIN') {
      companyId = body.companyId
      if (!companyId) {
        return withCors(ApiResponse.error('Company ID required for SUPER_ADMIN', 400), origin)
      }
    }
    
    if (!companyId) {
      return withCors(ApiResponse.error('No company access found', 403), origin)
    }

    const service = new GradeLevelService(companyId, user.userId, user.role)
    const grade = await service.updateGrade(params.id, body)
    
    return withCors(ApiResponse.success(grade, 'Grade level updated successfully'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}