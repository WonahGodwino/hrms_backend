import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

const ALLOWED_STATUSES = ['NOT_CONTACTED', 'CONTACTED', 'REJECTED_USAGE', 'USING_APP_NOW']

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 10)))
    const status = String(searchParams.get('status') || '').trim().toUpperCase()
    const search = String(searchParams.get('search') || '').trim()

    const where: any = {}
    if (status && ALLOWED_STATUSES.includes(status)) where.status = status

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { workEmail: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [total, records] = await Promise.all([
      (prisma as any).demoRequest.count({ where }),
      (prisma as any).demoRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          workEmail: true,
          phone: true,
          companyName: true,
          jobTitle: true,
          companySize: true,
          status: true,
          currentHRSystem: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ])

    return withCors(
      ApiResponse.success({
        items: records,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      }),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
