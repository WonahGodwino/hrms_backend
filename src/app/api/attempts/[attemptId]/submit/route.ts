import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// PUT /api/attempts/:attemptId/submit
// Body: { responses: [{question_id, selected_option_id?, selected_boolean?, time_spent_seconds?}], time_taken_seconds?, companyId? }
export async function PUT(req: NextRequest, { params }: { params: { attemptId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    const { responses, time_taken_seconds, companyId } = await req.json()
    if (!Array.isArray(responses)) return withCors(ApiResponse.error('responses array is required', 400), origin)

    const resolved = await resolveRequestCompanyId(user, companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: {
        id: params.attemptId,
        companyId: resolved.companyId,
        completedAt: null,
        ...(user.role === 'STAFF' ? { employeeId: user.userId } : {}),
      },
      include: { assessment: { include: { questions: true } } },
    })
    if (!attempt) return withCors(ApiResponse.error('Active attempt not found', 404), origin)

    const { assessment } = attempt
    let earned = 0
    let total  = 0

    for (const q of assessment.questions) {
      const resp = responses.find((r: any) => r.question_id === q.id || r.questionId === q.id)
      total += q.points
      if (!resp) continue
      if (q.type === 'true-false') {
        const ans = resp.selected_boolean ?? resp.selectedBoolean
        if (ans?.toString() === q.correctBoolean) earned += q.points
      } else {
        const ans = resp.selected_option_id ?? resp.selectedOptionId
        if (ans === q.correctOptionId) earned += q.points
      }
    }

    const score   = total > 0 ? Math.round((earned / total) * 100) : 0
    const outcome = score >= assessment.passingScore ? 'Passed' : 'Failed'

    const updated = await prisma.assessmentAttempt.update({
      where: { id: params.attemptId },
      data: { responses, score, outcome, timeTakenSeconds: time_taken_seconds ?? null, completedAt: new Date() },
    })

    // Auto-update participant progress on pass
    if (assessment.trainingProgramId && outcome === 'Passed') {
      await prisma.participantProgress.updateMany({
        where: { trainingProgramId: assessment.trainingProgramId, employeeId: attempt.employeeId },
        data: { score, trainingStatus: 'COMPLETED', progressPct: 100, completionDate: new Date() },
      })
    }

    await prisma.trainingAuditLog.create({
      data: {
        companyId: attempt.companyId,
        actorId: attempt.employeeId,
        action: 'SUBMITTED',
        entityType: 'assessment',
        entityId: attempt.assessmentId,
        metadata: { attemptId: params.attemptId, score, outcome, attemptNumber: attempt.attemptNumber },
      },
    })

    return withCors(ApiResponse.success({ score, outcome, passed: outcome === 'Passed' }, 'Assessment submitted'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// Support POST as alias
export const POST = PUT
