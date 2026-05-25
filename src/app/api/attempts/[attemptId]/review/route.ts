import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/attempts/:attemptId/review
// HR/ADMIN: full review with correct answers, explanations, and employee's responses
export async function GET(req: NextRequest, { params }: { params: { attemptId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: params.attemptId, companyId: user.companyId },
      include: {
        assessment: {
          include: {
            // Full question data including correct answers — review mode only
            questions: { orderBy: { order: 'asc' } },
          },
        },
        employee: { select: { id: true, firstName: true, lastName: true, email: true, staffId: true } },
      },
    })
    if (!attempt) return withCors(ApiResponse.error('Attempt not found', 404), origin)
    if (!attempt.completedAt) return withCors(ApiResponse.error('Attempt has not been completed yet', 400), origin)

    // Merge employee responses into question objects for easy front-end consumption
    const responses = (attempt.responses as any[]) ?? []
    const questions = attempt.assessment.questions.map(q => {
      const resp = responses.find((r: any) => r.question_id === q.id || r.questionId === q.id)
      return {
        ...q,
        employeeResponse: {
          selectedOptionId: resp?.selected_option_id ?? resp?.selectedOptionId ?? null,
          selectedBoolean:  resp?.selected_boolean   ?? resp?.selectedBoolean  ?? null,
          timeSpentSeconds: resp?.time_spent_seconds ?? resp?.timeSpent ?? null,
        },
        isCorrect: q.type === 'true-false'
          ? (resp?.selected_boolean ?? resp?.selectedBoolean)?.toString() === q.correctBoolean
          : (resp?.selected_option_id ?? resp?.selectedOptionId) === q.correctOptionId,
      }
    })

    return withCors(
      ApiResponse.success({
        attempt: { id: attempt.id, attemptNumber: attempt.attemptNumber, outcome: attempt.outcome, score: attempt.score, timeTakenSeconds: attempt.timeTakenSeconds, startedAt: attempt.startedAt, completedAt: attempt.completedAt },
        employee:  attempt.employee,
        questions,
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
