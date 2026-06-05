// src/app/api/grade-levels/allowance-rules/route.ts
import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { StaffGradeService } from '@/app/lib/services/staff-grade.service'

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
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

    let companyId = user.companyId
    const url = new URL(request.url)
    const gradeLevelId = url.searchParams.get('gradeLevelId') || undefined
    
    if (!companyId && user.role === 'SUPER_ADMIN') {
      companyId = url.searchParams.get('companyId') || ''
      if (!companyId) {
        return withCors(ApiResponse.error('Company ID required for SUPER_ADMIN', 400), origin)
      }
    }
    
    if (!companyId) {
      return withCors(ApiResponse.error('No company access found', 403), origin)
    }

    const service = new StaffGradeService(companyId, user.userId, user.role)
    const rules = await service.getAllowanceRules(gradeLevelId)
    
    return withCors(ApiResponse.success(rules), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRole(token, ['SUPER_ADMIN', 'HR', 'ADMIN'])

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

    const service = new StaffGradeService(companyId, user.userId, user.role)
    const rules = await service.updateAllowanceRules(body.rules)
    
    return withCors(ApiResponse.success(rules, 'Allowance rules updated successfully'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}