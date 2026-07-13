// src/app/api/departments/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateCompanyAccess } from '@/app/lib/departments/department-utils'

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
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const skip = (page - 1) * limit
    const companyId = searchParams.get('companyId')
    
    if (!companyId && user.role !== 'SUPER_ADMIN') {
      return withCors(ApiResponse.error('companyId is required', 400), origin)
    }
    
    let finalCompanyId = companyId
    if (user.role === 'SUPER_ADMIN' && !companyId) {
      const userCompanies = await prisma.userCompany.findMany({
        where: { userId: user.userId },
        select: { companyId: true }
      })
      if (userCompanies.length === 0) {
        return withCors(ApiResponse.success({ data: [], meta: { total: 0, page: 1, totalPages: 0 } }), origin)
      }
      finalCompanyId = userCompanies[0].companyId
    }
    
    if (finalCompanyId) {
      const hasAccess = await validateCompanyAccess(user, finalCompanyId)
      if (!hasAccess && user.role !== 'SUPER_ADMIN') {
        return withCors(ApiResponse.error('Forbidden: No access to this company', 403), origin)
      }
    }
    
    const where: any = {}
    if (finalCompanyId) where.companyId = finalCompanyId
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { businessUnit: { contains: search, mode: 'insensitive' } }
      ]
    }
    if (status) where.status = status
    
    const [departments, total] = await Promise.all([
      prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          code: true,
          businessUnit: true,
          headId: true,
          status: true,
          activeHeadcount: true,
          createdAt: true,
          head: { select: { id: true, firstName: true, lastName: true } }
        }
      }),
      prisma.department.count({ where })
    ])
    
    const data = departments.map(dep => ({
      id: dep.id,
      name: dep.name,
      code: dep.code,
      businessUnit: dep.businessUnit || '',
      headName: dep.head ? `${dep.head.firstName} ${dep.head.lastName}` : '',
      headId: dep.headId,
      activeHeadcount: dep.activeHeadcount || 0,
      status: dep.status,
      createdAt: dep.createdAt || null,
    }))
    
    return withCors(ApiResponse.success({
      data,
      meta: { total, page, totalPages: Math.ceil(total / limit) }
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}