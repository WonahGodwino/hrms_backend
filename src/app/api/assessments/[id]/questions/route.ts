import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/assessments/:id/questions  — correct answers hidden from STAFF
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])
    const isAdmin = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: resolved.companyId, deletedAt: null },
      select: { id: true, status: true },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)

    const questions = await prisma.question.findMany({
      where: { assessmentId: params.id },
      select: {
        id: true, order: true, title: true, type: true, prompt: true,
        options: true, points: true, difficulty: true, tags: true,
        required: true, shuffleAnswers: true, multipleSelections: true,
        // Correct answers only for admins outside of active attempt context
        ...(isAdmin && { correctOptionId: true, correctBoolean: true, explanation: true }),
      },
      orderBy: { order: 'asc' },
    })

    return withCors(ApiResponse.success(questions), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/assessments/:id/questions
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { type, prompt, options, correctOptionId, correctBoolean, explanation, points, difficulty, tags, required, shuffleAnswers, multipleSelections, title } = body

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: resolved.companyId, deletedAt: null },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)

    if (!type || !prompt || !options) return withCors(ApiResponse.error('type, prompt, options are required', 400), origin)

    const maxOrder = await prisma.question.aggregate({ where: { assessmentId: params.id }, _max: { order: true } })

    const question = await prisma.question.create({
      data: {
        assessmentId: params.id,
        order: (maxOrder._max.order ?? 0) + 1,
        title, type, prompt, options, correctOptionId, correctBoolean, explanation,
        points: points ?? 5,
        difficulty: difficulty ?? 'medium',
        tags: tags ?? [],
        required: required ?? true,
        shuffleAnswers: shuffleAnswers ?? false,
        multipleSelections: multipleSelections ?? false,
      },
    })
    return withCors(ApiResponse.success(question, 'Question added', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
