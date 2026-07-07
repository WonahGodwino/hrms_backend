// GET /api/recruitment/assessment-plans — list all plans
// POST /api/recruitment/assessment-plans — create a new draft plan
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
    if (user.role !== 'SUPER_ADMIN' && queryCompanyId && queryCompanyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))

    const where: any = { companyId, archived: 0 }
    if (status && ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) where.status = status
    if (search) where.name = { contains: search, mode: 'insensitive' }

    const [total, plans] = await Promise.all([
      prisma.recruitmentAssessmentPlan.count({ where }),
      prisma.recruitmentAssessmentPlan.findMany({
        where,
        include: { rounds: { select: { duration: true } }, candidateAssessments: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
    ])

    const data = plans.map(p => ({
      id: p.id, name: p.name,
      creator: p.createdBy,
      totalRounds: p.rounds.length,
      estimatedDurationMins: p.rounds.reduce((s, r) => s + r.duration, 0),
      activeJobsCount: p.candidateAssessments.length,
      status: p.status,
    }))

    return withCors(ApiResponse.success(data, 'Success', 200), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json()
    const { name, description } = body

    if (!name?.trim()) return withCors(ApiResponse.error('Plan name is required', 400), origin)

    const companyId = user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const plan = await prisma.recruitmentAssessmentPlan.create({
      data: { companyId, name: name.trim(), description: description?.trim() || null, createdBy: user.userId, status: 'DRAFT' },
    })

    return withCors(ApiResponse.success({ id: plan.id, name: plan.name, description: plan.description, status: plan.status, rounds: [] }, 'Plan initialized successfully.', 201), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
