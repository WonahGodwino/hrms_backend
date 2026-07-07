// GET /api/recruitment/assessment-plans/stats — KPI metrics
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
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const [totalActivePlans, draftPlans, plansWithCounts, totalInterviews] = await Promise.all([
      prisma.recruitmentAssessmentPlan.count({ where: { companyId, status: 'ACTIVE', archived: 0 } }),
      prisma.recruitmentAssessmentPlan.count({ where: { companyId, status: 'DRAFT', archived: 0 } }),
      prisma.recruitmentAssessmentPlan.findMany({
        where: { companyId, status: 'ACTIVE', archived: 0 },
        include: { candidateAssessments: { select: { id: true } } },
        orderBy: { candidateAssessments: { _count: 'desc' } },
        take: 1,
      }),
      prisma.recruitmentCandidateAssessment.count({ where: { companyId } }),
    ])

    const mostUsedPlan = plansWithCounts[0]?.name || null

    return withCors(ApiResponse.success({
      totalActivePlans, draftPlans, mostUsedPlan, totalInterviewsConducted: totalInterviews,
    }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
