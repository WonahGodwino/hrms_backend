// POST /api/recruitment/onboarding-templates/:id/publish — DRAFT → ACTIVE
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const { id } = await params
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const template = await prisma.onboardingTemplate.findFirst({
      where: { id, companyId },
      include: { tasks: { select: { id: true } } },
    })
    if (!template) return withCors(ApiResponse.error('Onboarding template not found', 404), origin)
    if (template.status !== 'DRAFT') return withCors(ApiResponse.error('Template is not in DRAFT status', 400), origin)
    if (template.tasks.length === 0) return withCors(ApiResponse.error('Template must have at least one task', 400), origin)

    await prisma.onboardingTemplate.update({ where: { id }, data: { status: 'ACTIVE', updatedBy: user.userId } })

    return withCors(ApiResponse.success({ id: template.id, status: 'ACTIVE' }, 'Template published successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
