// src/app/api/jobs/view/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    // 🔐 Auth
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(
        ApiResponse.error('Company context missing for this user', 400),
        origin
      )
    }

    const { searchParams } = new URL(request.url)

    // Optional filters
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || undefined

    // Pagination (defaults)
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '20')

    const take = pageSize > 0 ? pageSize : 20
    const skip = page > 1 ? (page - 1) * take : 0

    const where: any = {
      companyId: user.companyId,
    }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.job.count({ where }),
    ])

    const totalPages = Math.ceil(total / take) || 1

    return withCors(
      ApiResponse.success(
        {
          pagination: {
            total,
            page,
            pageSize: take,
            totalPages,
          },
          filters: {
            status: status || null,
            search: search || null,
          },
          jobs,
        },
        'Jobs fetched successfully'
      ),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
