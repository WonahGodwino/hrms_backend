// POST /api/recruitment/assessment-plans/:id/archive
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

    const plan = await prisma.recruitmentAssessmentPlan.findFirst({
      where: { id, companyId },
    })
    if (!plan) return withCors(ApiResponse.error('Assessment plan not found', 404), origin)

    await prisma.recruitmentAssessmentPlan.update({
      where: { id }, data: { status: 'ARCHIVED' },
    })

    return withCors(ApiResponse.success({ id: plan.id, status: 'ARCHIVED' }, 'Plan archived successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
