// GET /api/recruitment/assessment-plans/:id — plan detail with rounds
// POST /api/recruitment/assessment-plans/:id/rounds — handled by rounds/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const plan = await prisma.recruitmentAssessmentPlan.findFirst({
      where: { id: params.id, companyId },
      include: { rounds: { orderBy: { order: 'asc' } } },
    })
    if (!plan) return withCors(ApiResponse.error('Assessment plan not found', 404), origin)

    const totalDurationMins = plan.rounds.reduce((s, r) => s + r.duration, 0)

    return withCors(ApiResponse.success({
      id: plan.id, name: plan.name, description: plan.description, status: plan.status, totalDurationMins,
      rounds: plan.rounds.map(r => ({
        id: r.id, order: r.order, title: r.title, duration: r.duration,
        interviewType: r.interviewType, requiredInterviewers: r.requiredInterviewers,
        gradingMetric: r.gradingMetric, questionBanks: r.questionBanks,
      })),
    }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
