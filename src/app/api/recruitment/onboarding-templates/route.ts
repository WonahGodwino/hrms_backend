// GET /api/recruitment/onboarding-templates — list all templates
// POST /api/recruitment/onboarding-templates — create a new draft template
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

    const where: any = { companyId, archived: 0 }
    if (status && ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) where.status = status
    if (search) where.name = { contains: search, mode: 'insensitive' }

    const templates = await prisma.onboardingTemplate.findMany({
      where,
      include: { tasks: { select: { id: true } }, onboardings: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const data = templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      totalTasks: t.tasks.length,
      timesApplied: t.onboardings.length,
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

    if (!name?.trim()) return withCors(ApiResponse.error('Template name is required', 400), origin)

    const { searchParams } = new URL(request.url)
    const companyId = body.companyId || searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const template = await prisma.onboardingTemplate.create({
      data: { companyId, name: name.trim(), description: description?.trim() || null, createdBy: user.userId, status: 'DRAFT' },
    })

    return withCors(ApiResponse.success({ id: template.id, name: template.name, description: template.description, status: template.status, tasks: [] }, 'Template initialized successfully.', 201), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
