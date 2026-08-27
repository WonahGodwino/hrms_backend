import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/assessments/:id/results
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20', 10))
    const search = searchParams.get('search')?.trim()
    const status = searchParams.get('status')
    const department = searchParams.get('department')

    const where: any = {
      assessmentId: params.id,
      companyId: resolved.companyId,
    }

    if (status) {
      if (status.toLowerCase() === 'passed') where.outcome = 'Passed'
      else if (status.toLowerCase() === 'failed') where.outcome = 'Failed'
      else where.outcome = status
    }

    if (department || search) {
      where.employee = {}
      if (department) where.employee.department = department
      if (search) {
        const q = search.toLowerCase()
        where.employee.OR = [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { staffId: { contains: q, mode: 'insensitive' } },
        ]
      }
    }

    const [total, attempts] = await Promise.all([
      prisma.assessmentAttempt.count({ where }),
      prisma.assessmentAttempt.findMany({
        where,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, staffId: true, department: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const items = attempts.map((a) => {
      const minutes = a.timeTakenSeconds ? Math.round(a.timeTakenSeconds / 60) : 0
      return {
        id: a.id,
        employeeId: a.employee.id,
        staffId: a.employee.staffId,
        name: `${a.employee.firstName} ${a.employee.lastName}`,
        department: a.employee.department ?? 'N/A',
        score: a.score ?? 0,
        status: (a.outcome ?? 'pending').toLowerCase(),
        timeTaken: `${minutes} min`,
        attemptId: a.id,
        submittedAt: a.completedAt ? a.completedAt.toISOString() : a.createdAt.toISOString(),
      }
    })

    return withCors(
      ApiResponse.success({
        items,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
