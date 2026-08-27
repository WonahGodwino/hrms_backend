import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/assessments?status=&type=&category=&program_id=&search=&page=&limit=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const status    = searchParams.get('status')
    const type      = searchParams.get('type')
    const category  = searchParams.get('category')
    const programId = searchParams.get('program_id')
    const search    = searchParams.get('search')
    const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit     = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))

    const where: any = { companyId, deletedAt: null }
    if (status)    where.status             = status
    if (type)      where.type               = type
    if (category)  where.category           = category
    if (programId) where.trainingProgramId  = programId
    if (search)    where.name               = { contains: search, mode: 'insensitive' }

    const [total, assessments] = await Promise.all([
      prisma.assessment.count({ where }),
      prisma.assessment.findMany({
        where,
        include: {
          trainingProgram: { select: { id: true, programName: true } },
          _count: { select: { questions: true, attempts: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return withCors(ApiResponse.success({ assessments, total, page, limit }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/assessments
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { companyId, trainingProgramId, name, type, description, timeLimitMinutes, passingScore, maxAttempts, category, difficulty, shuffleQuestions } = body

    const resolved = await resolveRequestCompanyId(user, companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved

    if (!name || !type || passingScore === undefined)
      return withCors(ApiResponse.error('companyId, name, type, passingScore are required', 400), origin)

    const assessment = await prisma.assessment.create({
      data: {
        companyId: cid, trainingProgramId, name, type,
        status: 'DRAFT', description, timeLimitMinutes, passingScore,
        maxAttempts, category, difficulty, shuffleQuestions: shuffleQuestions ?? false,
        createdBy: user.userId,
      },
    })
    return withCors(ApiResponse.success(assessment, 'Assessment created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
