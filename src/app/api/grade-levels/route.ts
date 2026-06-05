// src/app/api/grade-levels/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { GradeLevelService } from '@/app/lib/services/grade-level.service'

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

    // Get user's company ID
    let companyId = user.companyId
    
    if (!companyId && user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN needs to specify which company they're working with
      const url = new URL(request.url)
      companyId = url.searchParams.get('companyId') || ''
      if (!companyId) {
        return withCors(ApiResponse.error('Company ID required for SUPER_ADMIN', 400), origin)
      }
    }
    
    if (!companyId) {
      return withCors(ApiResponse.error('No company access found', 403), origin)
    }

    const { searchParams } = new URL(request.url)
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