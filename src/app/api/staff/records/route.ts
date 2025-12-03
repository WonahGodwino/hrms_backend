import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

// OPTIONS: Pre-flight for CORS
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET: Return all staff records scoped by company and optional department filter
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    // Only HR, SUPER_ADMIN, MANAGER can use this endpoint
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const department = searchParams.get('department')

    const skip = (page - 1) * limit

    // Company scoped filtering
    const where: any = {}
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId) {
        return withCors(ApiResponse.error('No company assigned for this user', 400), origin)
      }
      where.companyId = user.companyId
    }

    if (department) {
      where.department = { contains: department, mode: 'insensitive' }
    }

    // Fetch staff records with optional pagination
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

    return withCors(
      ApiResponse.success({
        staffRecords,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

// GET: Search staff records by multiple fields
export async function SEARCH(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    // Only HR, SUPER_ADMIN, MANAGER can use this endpoint
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const search = searchParams.get('search')

    const skip = (page - 1) * limit

    // Company scoped filtering
    const where: any = {}
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.companyId) {
        return withCors(ApiResponse.error('No company assigned for this user', 400), origin)
      }
      where.companyId = user.companyId
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Fetch staff records with optional pagination
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

    return withCors(
      ApiResponse.success({
        staffRecords,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
