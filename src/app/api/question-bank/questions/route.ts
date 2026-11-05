import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { getOrCreateQuestionBankAssessment } from '@/app/lib/training/question-bank'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/question-bank/questions?companyId=&page=&limit=&search=&category=&difficulty=&type=&status=
// Lists every question in the company's reusable question bank.
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const search     = searchParams.get('search')?.trim()
    const difficulty = searchParams.get('difficulty')
    const type       = searchParams.get('type')
    const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit      = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10)))

    const bankId = await getOrCreateQuestionBankAssessment(companyId)

    const where: any = { assessmentId: bankId }
    if (search) {
      where.OR = [
        { prompt: { contains: search, mode: 'insensitive' } },
        { title:  { contains: search, mode: 'insensitive' } },
      ]
    }
    if (difficulty) where.difficulty = difficulty.toLowerCase()
    if (type)       where.type       = type

    const [total, questions] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return withCors(
      ApiResponse.success({
        questions: questions.map((q) => ({ ...q, bankAssessmentId: bankId })),
        total, page, limit,
      }),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/question-bank/questions — create a question in the bank.
// Body: { type, prompt, options, correctOptionId?, correctBoolean?, explanation?,
//         points?, difficulty?, tags?, required?, shuffleAnswers?, multipleSelections?, title?, companyId? }
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { type, prompt, options, correctOptionId, correctBoolean, explanation, points, difficulty, tags, required, shuffleAnswers, multipleSelections, title } = body

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    if (!type || !prompt || !options) {
      return withCors(ApiResponse.error('type, prompt and options are required', 400), origin)
    }

    const bankId = await getOrCreateQuestionBankAssessment(companyId)
    const maxOrder = await prisma.question.aggregate({ where: { assessmentId: bankId }, _max: { order: true } })

    const question = await prisma.question.create({
      data: {
        assessmentId: bankId,
        order: (maxOrder._max.order ?? 0) + 1,
        title: title ?? String(prompt).slice(0, 80),
        type, prompt, options, correctOptionId, correctBoolean, explanation,
        points: points ?? 5,
        difficulty: difficulty ?? 'medium',
        tags: tags ?? [],
        required: required ?? true,
        shuffleAnswers: shuffleAnswers ?? false,
        multipleSelections: multipleSelections ?? false,
      },
    })
    return withCors(ApiResponse.success({ ...question, bankAssessmentId: bankId }, 'Question added to bank', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
