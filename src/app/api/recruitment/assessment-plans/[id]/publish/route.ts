// POST /api/recruitment/assessment-plans/:id/publish
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { notifyAssessmentPanel } from '@/app/lib/assessments/panel-notify'

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
      include: { rounds: { select: { id: true } } },
    })
    if (!plan) return withCors(ApiResponse.error('Assessment plan not found', 404), origin)
    if (plan.status !== 'DRAFT') return withCors(ApiResponse.error('Plan is not in DRAFT status', 400), origin)
    if (plan.rounds.length === 0) return withCors(ApiResponse.error('Plan must have at least one round', 400), origin)

    await prisma.recruitmentAssessmentPlan.update({
      where: { id }, data: { status: 'ACTIVE' },
    })

    // Notify the interview panel (fire-and-forget so email never blocks publish).
    void notifyAssessmentPanel(id, companyId)
      .then((r) => console.log(`[ASSESSMENT_PUBLISH] Panel notified for ${plan.id}:`, r))
      .catch((err) => console.error(`[ASSESSMENT_PUBLISH] Panel notify failed for ${plan.id}:`, err))

    return withCors(ApiResponse.success({ id: plan.id, status: 'ACTIVE' }, 'Plan published successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
