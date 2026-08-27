import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/assessments/:id/analytics
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: resolved.companyId, deletedAt: null },
      select: { id: true, passingScore: true, _count: { select: { questions: true } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)

    const [totalAssigned, passed, failed, pending, scoreAgg] = await Promise.all([
      prisma.assessmentAttempt.count({ where: { assessmentId: params.id } }),
      prisma.assessmentAttempt.count({ where: { assessmentId: params.id, outcome: 'Passed' } }),
      prisma.assessmentAttempt.count({ where: { assessmentId: params.id, outcome: 'Failed' } }),
      prisma.assessmentAttempt.count({ where: { assessmentId: params.id, outcome: 'Pending' } }),
      prisma.assessmentAttempt.aggregate({
        where: { assessmentId: params.id, score: { not: null } },
        _avg: { score: true },
        _min: { score: true },
        _max: { score: true },
      }),
    ])

    const completed  = passed + failed
    const avgScore   = scoreAgg._avg.score ? Math.round(Number(scoreAgg._avg.score)) : 0
    const passRate   = completed > 0 ? Math.round((passed / completed) * 100) : 0
    const completionRate = totalAssigned > 0 ? Math.round((completed / totalAssigned) * 100) : 0

    return withCors(
      ApiResponse.success({ totalAssigned, passed, failed, pending, avgScore, passRate, completionRate,
        minScore: scoreAgg._min.score ?? 0, maxScore: scoreAgg._max.score ?? 0, questionCount: assessment._count.questions }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
