// src/app/api/departments/[id]/staff/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess } from '@/app/lib/departments/department-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    
    const department = await getDepartmentWithAccess(user, params.id)
    
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const positionFilter = searchParams.get('position')
    const search = searchParams.get('search') || ''
    
    const skip = (page - 1) * limit
    
    const where: any = { 
      departmentId: params.id,  // Using departmentId, NOT the relation
      companyId: department.companyId,
      isActive: true 
    }
    
    if (positionFilter) {
      where.position = positionFilter
    }
    
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    }
    
    const [data, total] = await Promise.all([
      prisma.staffRecord.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          position: true,
          isActive: true,
          phone: true,
          avatarUrl: true,
          departments: {  // ← USING THE RELATION NAME WITH 's'
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        },
        orderBy: { firstName: 'asc' }
      }),
      prisma.staffRecord.count({ where })
    ])
    
    const formattedData = data.map(staff => ({
      id: staff.id,
      name: `${staff.firstName} ${staff.lastName}`,
      email: staff.email,
      designation: {
        id: staff.position || 'unassigned',
        name: staff.position || 'Unassigned',
      },
      status: staff.isActive ? 'Active' : 'Inactive',
      phone: staff.phone,
      avatarSrc: staff.avatarUrl,
      department: staff.departments ? {  // ← Using the relation
        id: staff.departments.id,
        name: staff.departments.name,
        code: staff.departments.code
      } : null
    }))
    
    return withCors(ApiResponse.success({
      data: formattedData,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}