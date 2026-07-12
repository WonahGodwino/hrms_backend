// GET /api/recruitment/offers — list all offers (paginated, filterable)
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const queryCompanyId = searchParams.get('companyId')
    const companyId = queryCompanyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))

    const where: any = { companyId, archived: 0 }
    if (status && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'AWAITING_SIGNATURE', 'ACCEPTED', 'DECLINED', 'REJECTED'].includes(status))
      where.status = status

    const [total, offers] = await Promise.all([
      prisma.offer.count({ where }),
      prisma.offer.findMany({
        where,
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          application: { select: { job: { select: { title: true, department: true } } } },
        },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
    ])

    const data = offers.map(o => ({
      id: o.id,
      candidate: {
        id: o.candidate.id,
        name: `${o.candidate.firstName} ${o.candidate.lastName}`.trim(),
        email: o.candidate.email || null,
      },
      role: o.application.job?.title || 'Unknown',
      department: o.application.job?.department || '',
      baseSalary: o.salary ? Number(o.salary) : 0,
      currency: o.currency || 'NGN',
      status: o.status,
      gradeName: o.gradeName || null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    }))

    return withCors(ApiResponse.success({ data, meta: { total, page, totalPages: Math.ceil(total / limit) } }, 'Success', 200), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
