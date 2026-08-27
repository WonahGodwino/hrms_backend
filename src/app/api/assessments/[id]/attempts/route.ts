import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import rateLimit from '@/app/lib/rateLimiter'

const limiter = rateLimit({ interval: 60_000 })

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/assessments/:id/attempts?employee_id=&outcome=&page=&limit=
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const employeeId = searchParams.get('employee_id')
    const outcome    = searchParams.get('outcome')
    const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit      = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: resolved.companyId, deletedAt: null },
      select: { id: true },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)

    const where: any = { assessmentId: params.id, companyId: resolved.companyId }
    if (employeeId) where.employeeId = employeeId
    if (outcome)    where.outcome    = outcome

    const [total, attempts] = await Promise.all([
      prisma.assessmentAttempt.count({ where }),
      prisma.assessmentAttempt.findMany({
        where,
        include: { employee: { select: { id: true, firstName: true, lastName: true, email: true, staffId: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return withCors(ApiResponse.success({ attempts, total, page, limit }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/assessments/:id/attempts  — START a new attempt
// Returns questions WITHOUT correct answers
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN'])

    // 10 attempt starts per minute per user
    try { await limiter.check(10, `attempt-start:${user.userId}`) }
    catch { return withCors(ApiResponse.error('Too many requests. Please wait before starting another attempt.', 429), origin) }

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: resolved.companyId, status: 'ACTIVE', deletedAt: null },
      include: {
        questions: {
          select: {
            id: true, order: true, title: true, type: true, prompt: true,
            options: true, points: true, difficulty: true, required: true,
            shuffleAnswers: true, multipleSelections: true,
            // correctOptionId and correctBoolean intentionally excluded
          },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found or not active', 404), origin)

    // Check attempt count
    const previousAttempts = await prisma.assessmentAttempt.count({
      where: { assessmentId: params.id, employeeId: user.userId },
    })

    const maxAllowed = assessment.maxAttempts
    const atLimit = maxAllowed !== null && previousAttempts >= maxAllowed
    if (atLimit) {
      // HR/Admin can grant a retake on the last attempt
      const lastAttempt = await prisma.assessmentAttempt.findFirst({
        where: { assessmentId: params.id, employeeId: user.userId },
        orderBy: { attemptNumber: 'desc' },
      })
      if (!lastAttempt?.retakeAllowed)
        return withCors(ApiResponse.error('Maximum attempts reached', 403), origin)
    }

    // Create attempt record
    const attempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId:  params.id,
        employeeId:    user.userId,
        companyId:     resolved.companyId,
        attemptNumber: previousAttempts + 1,
        outcome:       'Pending',
        retakeAllowed: false,
        startedAt:     new Date(),
      },
    })

    // Shuffle questions if enabled
    let questions = assessment.questions
    if (assessment.shuffleQuestions) {
      questions = [...questions].sort(() => Math.random() - 0.5)
    }

    return withCors(
      ApiResponse.success({ attemptId: attempt.id, attemptNumber: attempt.attemptNumber, questions }, 'Attempt started', 201),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}
