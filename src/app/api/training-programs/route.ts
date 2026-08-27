import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/training-programs?status=&category=&training_type=&level=&search=&sort=&page=&limit=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const status        = searchParams.get('status')
    const category      = searchParams.get('category')
    const trainingType  = searchParams.get('training_type')
    const level         = searchParams.get('level')
    const search        = searchParams.get('search')
    const sort          = searchParams.get('sort') ?? 'createdAt'
    const page          = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit         = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))

    const where: any = { companyId, deletedAt: null }
    if (status)       where.status       = status
    if (category)     where.category     = category
    if (trainingType) where.trainingType = trainingType
    if (level)        where.level        = level
    if (search)       where.programName  = { contains: search, mode: 'insensitive' }

    const orderBy: any = sort === 'name' ? { programName: 'asc' } : { createdAt: 'desc' }

    const [total, programs] = await Promise.all([
      prisma.trainingProgram.count({ where }),
      prisma.trainingProgram.findMany({
        where,
        include: {
          assessments: { select: { id: true, name: true, type: true, status: true }, where: { deletedAt: null } },
          _count: { select: { participants: true, sessions: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return withCors(ApiResponse.success({ programs, total, page, limit, pages: Math.ceil(total / limit) }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/training-programs
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const {
      companyId, programName, category, trainingType, description, level,
      departments, trainer, durationHours, sessionType, startDate, endDate,
      location, maxParticipants, assessmentRequired, assessmentType,
      passingScore, maxAttempts, autoCertificate, assignmentMethod, dueDate,
      notifyEmployees, status,
    } = body

    const resolved = await resolveRequestCompanyId(user, companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved
    if (!programName || !category || !trainingType || !description || !trainer || !startDate || !endDate || !dueDate)
      return withCors(ApiResponse.error('programName, category, trainingType, description, trainer, startDate, endDate, dueDate are required', 422), origin)

    const start = new Date(startDate)
    const end   = new Date(endDate)
    const due   = new Date(dueDate)
    if (end < start)  return withCors(ApiResponse.error('endDate must be on or after startDate', 422), origin)
    if (due > end)    return withCors(ApiResponse.error('dueDate must be on or before endDate', 422), origin)

    const slug = programName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now()

    const program = await prisma.trainingProgram.create({
      data: {
        companyId: cid, programName, slug, category, trainingType,
        description, level: level ?? 'Beginner',
        departments: departments ?? [],
        trainer, durationHours, sessionType: sessionType ?? 'Single',
        startDate: start, endDate: end,
        location, maxParticipants,
        assessmentRequired: assessmentRequired ?? true,
        assessmentType: assessmentType ?? 'Quiz',
        passingScore: passingScore ?? 80,
        maxAttempts: maxAttempts ?? 3,
        autoCertificate: autoCertificate ?? true,
        assignmentMethod: assignmentMethod ?? 'Automatic Enrollment',
        dueDate: due,
        notifyEmployees: notifyEmployees ?? true,
        status: status ?? 'DRAFT',
        createdBy: user.userId,
      },
    })

    return withCors(ApiResponse.success(program, 'Training program created', 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
