//api/recruitment/applicants
// src/app/api/recruitment/applicants/route.ts

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
    // Get the authentication header and verify the user role
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN'])

    if (!user.companyId) {
      return withCors(ApiResponse.error('Company context missing for this user', 400), origin)
    }

    const companyId = user.companyId as string
    const { searchParams } = new URL(request.url)

    // Pagination (defaults to page 1, page size 20)
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '20')
    const take = pageSize > 0 ? pageSize : 20
    const skip = page > 1 ? (page - 1) * take : 0

    // Filter params
    const jobTitle = searchParams.get('jobTitle') || ''
    const jobId = searchParams.get('jobId') || ''
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Build filter for job applications
    const where: any = {
      job: {
        companyId,
      },
    }

    if (jobTitle) {
      where.job = {
        title: { contains: jobTitle, mode: 'insensitive' },
      }
    }

    if (jobId) {
      where.jobId = jobId
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      }
    }

    // Fetch applications grouped by job ID and sorted by application date (DESC)
    const [applications, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        include: {
          job: { select: { id: true, title: true } },
        },
        orderBy: {
          createdAt: 'desc', // Sort by application date
        },
        skip,
        take,
      }),
      prisma.jobApplication.count({ where }),
    ])

    const totalPages = Math.ceil(total / take) || 1

    // Group applications by job
    const groupedApplications = applications.reduce((acc, application) => {
      const jobId = application.jobId
      if (!acc[jobId]) acc[jobId] = []
      acc[jobId].push(application)
      return acc
    }, {} as Record<string, any[]>)

    return withCors(
      ApiResponse.success(
        {
          pagination: {
            total,
            page,
            pageSize: take,
            totalPages,
          },
          groupedApplications, // Grouped by jobId
        },
        'Job applications fetched successfully'
      ),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
