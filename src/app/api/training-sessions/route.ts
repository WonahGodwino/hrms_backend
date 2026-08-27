import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

// GET /api/training-sessions?program_id=&status=&type=&date_from=&date_to=&search=&page=&limit=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved
    const programId  = searchParams.get('program_id')
    const status     = searchParams.get('status')
    const type       = searchParams.get('type')
    const dateFrom   = searchParams.get('date_from')
    const dateTo     = searchParams.get('date_to')
    const search     = searchParams.get('search')
    const page       = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit      = Math.min(200, parseInt(searchParams.get('limit') ?? '50'))

    const where: any = { companyId }
    if (programId) where.trainingProgramId = programId
    if (status)    where.status = status
    if (type)      where.type   = type
    if (search)    where.title  = { contains: search, mode: 'insensitive' }
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) where.date.gte = new Date(dateFrom)
      if (dateTo)   where.date.lte = new Date(dateTo)
    }

    const [total, sessions] = await Promise.all([
      prisma.trainingSession.count({ where }),
      prisma.trainingSession.findMany({
        where,
        include: { trainingProgram: { select: { id: true, programName: true, category: true } } },
        orderBy: { date: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    return withCors(ApiResponse.success({ sessions, total, page, limit }), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

// POST /api/training-sessions
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const { companyId, trainingProgramId, title, date, time, type, trainer, capacity, location, duration, summary, programLabel } = body

    const resolved = await resolveRequestCompanyId(user, companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved
    if (!trainingProgramId || !title || !date || !type)
      return withCors(ApiResponse.error('companyId, trainingProgramId, title, date, type are required', 400), origin)

    const program = await prisma.trainingProgram.findFirst({
      where: { id: trainingProgramId, companyId: cid, deletedAt: null },
      select: { id: true },
    })
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    const session = await prisma.trainingSession.create({
      data: {
        companyId: cid, trainingProgramId, title,
        date: new Date(date), time, type,
        status: 'Upcoming', trainer, capacity, location, duration, summary, programLabel,
        createdBy: user.userId,
      },
    })

    return withCors(ApiResponse.success(session, 'Session created', 201), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
