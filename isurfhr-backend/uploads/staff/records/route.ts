// src/app/api/staff/records/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'

export async function GET(request: NextRequest) {
  try {
    // 1) Ensure we have an Authorization header and a clean token string
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return ApiResponse.error('Authorization header missing', 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const department = searchParams.get('department')
    const search = searchParams.get('search')

    const skip = (page - 1) * limit

    // 2) Base where clause with company scoping
    const where: any = {}

    // If you want SUPER_ADMIN to see all companies, leave them unscoped.
    // For HR/MANAGER, lock to their company.
    if (user.role !== 'SUPER_ADMIN') {
      where.companyId = user.companyId
    }

    if (department) {
      where.department = { contains: department, mode: 'insensitive' }
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [staffRecords, totalCount] = await Promise.all([
      prisma.staffRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          staffId: true,
          email: true,
          firstName: true,
          lastName: true,
          department: true,
          position: true,
          phone: true,
          isActive: true,
          createdAt: true,
          companyId: true,
        },
      }),
      prisma.staffRecord.count({ where }),
    ])

    return ApiResponse.success({
      staffRecords,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}
