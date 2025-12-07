// src/app/api/jobs/public/view/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)

    // Optional: simple pagination for public listing
    const page = Number(searchParams.get('page') || '1')
    const pageSize = Number(searchParams.get('pageSize') || '20')

    const take = pageSize > 0 ? pageSize : 20
    const skip = page > 1 ? (page - 1) * take : 0

    // Optional: public search by text
    const search = searchParams.get('search') || undefined

    const now = new Date()

    const where: any = {
      status: 'ACTIVE',
      // Comment this out if you want to show expired ones too:
      expirationDate: {
        gte: now,
      },
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' }, // published date DESC
        skip,
        take,
        include: {
          company: {
            select: {
              companyName: true,
            },
          },
        },
      }),
      prisma.job.count({ where }),
    ])

    const totalPages = Math.ceil(total / take) || 1

    // Transform to only expose what you want publicly
    const publicJobs = jobs.map((job) => ({
      id: job.id,
      title: job.title,
      department: job.department,
      position: job.position,
      description: job.description,
      companyName: job.company?.companyName ?? null,
      publishedAt: job.createdAt,
      expirationDate: job.expirationDate,
    }))

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
            search: search || null,
          },
          jobs: publicJobs,
        },
        'Public jobs fetched successfully'
      ),
      origin
    )
  } catch (error) {
    const message = formatError(error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}
