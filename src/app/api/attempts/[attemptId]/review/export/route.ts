import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/attempts/:attemptId/review/export
export async function GET(req: NextRequest, { params }: { params: { attemptId: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const attempt = await prisma.assessmentAttempt.findFirst({
      where: { id: params.attemptId, companyId: resolved.companyId },
      include: {
        assessment: {
          include: {
            questions: { orderBy: { order: 'asc' } },
          },
        },
        employee: { select: { id: true, firstName: true, lastName: true, email: true, staffId: true } },
      },
    })

    if (!attempt) {
      return withCors(ApiResponse.error('Attempt not found', 404), origin)
    }

    const responses = (attempt.responses as any[]) ?? []
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

    const headers = [
      'Question #',
      'Prompt',
      'Selected Option / Answer',
      'Correct Answer',
      'Result',
      'Points',
    ].join(',')

    const rows = attempt.assessment.questions.map((q, idx) => {
      const resp = responses.find((r: any) => r.question_id === q.id || r.questionId === q.id)
      const selected = resp?.selected_option_id ?? resp?.selectedOptionId ?? resp?.selectedBoolean ?? 'N/A'
      const correct = q.type === 'true-false' ? q.correctBoolean : q.correctOptionId
      const isCorrect =
        q.type === 'true-false'
          ? String(resp?.selectedBoolean ?? resp?.selected_boolean) === q.correctBoolean
          : (resp?.selected_option_id ?? resp?.selectedOptionId) === q.correctOptionId

      return [
        idx + 1,
        q.prompt,
        selected,
        correct,
        isCorrect ? 'Correct' : 'Incorrect',
        isCorrect ? q.points : 0,
      ]
        .map(escape)
        .join(',')
    })

    const csv = [headers, ...rows].join('\n')
    const filename = `attempt-review-${attempt.id}.csv`

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': origin ?? '*',
      },
    })
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
