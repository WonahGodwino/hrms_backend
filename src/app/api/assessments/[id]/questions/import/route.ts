import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/assessments/:id/questions/import
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { questions, duplicateHandling } = body

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: resolved.companyId, deletedAt: null },
    })

    if (!assessment) {
      return withCors(ApiResponse.error('Assessment not found', 404), origin)
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return withCors(ApiResponse.error('No questions provided for import', 400), origin)
    }

    // Get maximum order currently in assessment
    const maxOrderAgg = await prisma.question.aggregate({
      where: { assessmentId: assessment.id },
      _max: { order: true },
    })
    let currentOrder = (maxOrderAgg._max.order ?? 0) + 1

    let imported = 0
    let skipped = 0
    let failed = 0
    const errors: { rowNumber: number; message: string }[] = []

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const rowNumber = i + 1

      if (!q.prompt && !q.title) {
        failed++
        errors.push({ rowNumber, message: 'Missing question prompt or title' })
        continue
      }

      try {
        const options = Array.isArray(q.options)
          ? q.options
          : typeof q.options === 'string'
          ? JSON.parse(q.options)
          : [
              { id: 'opt-a', label: 'Option A', value: 'Option A' },
              { id: 'opt-b', label: 'Option B', value: 'Option B' },
            ]

        await prisma.question.create({
          data: {
            assessmentId: assessment.id,
            order: currentOrder++,
            title: q.title || q.prompt,
            type: q.type || 'multiple-choice',
            prompt: q.prompt || q.title,
            options,
            correctOptionId: q.correctOptionId || options[0]?.id || null,
            explanation: q.explanation || null,
            points: q.points ? parseInt(String(q.points), 10) : 5,
            difficulty: q.difficulty || 'medium',
            required: q.required !== undefined ? Boolean(q.required) : true,
            shuffleAnswers: Boolean(q.shuffleAnswers),
            multipleSelections: Boolean(q.multipleSelections),
          },
        })
        imported++
      } catch (err: any) {
        failed++
        errors.push({ rowNumber, message: err.message || 'Failed to save question' })
      }
    }

    return withCors(
      ApiResponse.success({
        imported,
        skipped,
        failed,
        errors,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
