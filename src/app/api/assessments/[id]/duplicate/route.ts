import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/assessments/:id/duplicate
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const sourceAssessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: resolved.companyId, deletedAt: null },
      include: { questions: true },
    })

    if (!sourceAssessment) {
      return withCors(ApiResponse.error('Source assessment not found', 404), origin)
    }

    const duplicated = await prisma.assessment.create({
      data: {
        companyId: resolved.companyId,
        trainingProgramId: sourceAssessment.trainingProgramId,
        name: `${sourceAssessment.name} (Copy)`,
        type: sourceAssessment.type,
        status: 'DRAFT',
        description: sourceAssessment.description,
        timeLimitMinutes: sourceAssessment.timeLimitMinutes,
        passingScore: sourceAssessment.passingScore,
        maxAttempts: sourceAssessment.maxAttempts,
        category: sourceAssessment.category,
        difficulty: sourceAssessment.difficulty,
        shuffleQuestions: sourceAssessment.shuffleQuestions,
        createdBy: user.userId,
      },
    })

    if (sourceAssessment.questions.length > 0) {
      await Promise.all(
        sourceAssessment.questions.map((q) =>
          prisma.question.create({
            data: {
              assessmentId: duplicated.id,
              order: q.order,
              title: q.title,
              type: q.type,
              prompt: q.prompt,
              options: q.options as any,
              correctOptionId: q.correctOptionId,
              correctBoolean: q.correctBoolean,
              explanation: q.explanation,
              points: q.points,
              difficulty: q.difficulty,
              tags: q.tags,
              required: q.required,
              shuffleAnswers: q.shuffleAnswers,
              multipleSelections: q.multipleSelections,
            },
          })
        )
      )
    }

    return withCors(
      ApiResponse.success(
        {
          id: duplicated.id,
          status: duplicated.status,
          name: duplicated.name,
        },
        'Assessment duplicated successfully',
        201
      ),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
