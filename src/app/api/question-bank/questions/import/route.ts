import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { getOrCreateQuestionBankAssessment } from '@/app/lib/training/question-bank'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// POST /api/question-bank/questions/import?companyId=
// Body: { questions: [{ type, prompt, options, correctOptionId?, ... }] }
// Bulk-imports parsed questions into the company's reusable question bank.
// Row-level failures are reported individually; valid rows are still imported.
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const questions = Array.isArray(body.questions) ? body.questions : []
    if (questions.length === 0) {
      return withCors(ApiResponse.error('questions array is required', 400), origin)
    }
    if (questions.length > 500) {
      return withCors(ApiResponse.error('Cannot import more than 500 questions at once', 400), origin)
    }

    const bankId = await getOrCreateQuestionBankAssessment(companyId)
    let order = (await prisma.question.aggregate({ where: { assessmentId: bankId }, _max: { order: true } }))?._max?.order ?? 0

    const imported: any[] = []
    const errors: { row: number; question: string; message: string }[] = []

    for (const [index, q] of questions.entries()) {
      const label = q?.prompt ?? q?.question ?? `Row ${index + 1}`
      try {
        if (!q?.type || !q?.prompt || !q?.options || !Array.isArray(q.options) || q.options.length === 0) {
          throw new Error('type, prompt and a non-empty options array are required')
        }
        order += 1
        const created = await prisma.question.create({
          data: {
            assessmentId: bankId,
            order,
            title: q.title ?? String(q.prompt).slice(0, 80),
            type: q.type,
            prompt: q.prompt,
            options: q.options,
            correctOptionId: q.correctOptionId ?? null,
            correctBoolean: q.correctBoolean ?? null,
            explanation: q.explanation ?? null,
            points: q.points !== undefined ? Number(q.points) : 5,
            difficulty: q.difficulty ?? 'medium',
            tags: q.tags ?? [],
            required: q.required ?? true,
            shuffleAnswers: q.shuffleAnswers ?? false,
            multipleSelections: q.multipleSelections ?? false,
          },
        })
        imported.push(created)
      } catch (e: any) {
        errors.push({ row: index + 1, question: String(label).slice(0, 80), message: e?.message ?? 'Failed to import question.' })
      }
    }

    return withCors(
      ApiResponse.success(
        { imported: imported.length, failed: errors.length, errors, questions: imported },
        `Imported ${imported.length} of ${questions.length} questions`,
      ),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
