import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

async function findProgram(idOrSlug: string, companyId: string) {
  return prisma.trainingProgram.findFirst({
    where: {
      companyId,
      deletedAt: null,
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
  })
}

// GET /api/training-programs/:slug  — rich detail view
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const program = await prisma.trainingProgram.findFirst({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        OR: [{ id: params.id }, { slug: params.id }],
      },
      include: {
        sessions:   { orderBy: { date: 'asc' } },
        materials:  { orderBy: { createdAt: 'asc' } },
        assessment: {
          include: {
            questions: {
              select: { id: true, order: true, title: true, type: true, prompt: true, points: true, difficulty: true, tags: true },
              orderBy: { order: 'asc' },
            },
            _count: { select: { attempts: true } },
          },
        },
        _count: { select: { participants: true, sessions: true } },
      },
    })

    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    const [completedCount, inProgressCount] = await Promise.all([
      prisma.participantProgress.count({ where: { trainingProgramId: program.id, trainingStatus: 'COMPLETED' } }),
      prisma.participantProgress.count({ where: { trainingProgramId: program.id, trainingStatus: 'IN PROGRESS' } }),
    ])

    const stats = {
      totalEnrolled:   program._count.participants,
      completed:       completedCount,
      inProgress:      inProgressCount,
      notStarted:      program._count.participants - completedCount - inProgressCount,
      completionRate:  program._count.participants > 0 ? Math.round((completedCount / program._count.participants) * 100) : 0,
    }

    return withCors(ApiResponse.success({ ...program, stats }), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// PUT /api/training-programs/:id
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const program = await findProgram(params.id, user.companyId!)
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    const body = await req.json()
    const updated = await prisma.trainingProgram.update({
      where: { id: program.id },
      data: {
        ...(body.programName       !== undefined && { programName:       body.programName }),
        ...(body.category          !== undefined && { category:          body.category }),
        ...(body.trainingType      !== undefined && { trainingType:      body.trainingType }),
        ...(body.description       !== undefined && { description:       body.description }),
        ...(body.level             !== undefined && { level:             body.level }),
        ...(body.departments       !== undefined && { departments:       body.departments }),
        ...(body.trainer           !== undefined && { trainer:           body.trainer }),
        ...(body.durationHours     !== undefined && { durationHours:     body.durationHours }),
        ...(body.sessionType       !== undefined && { sessionType:       body.sessionType }),
        ...(body.startDate         !== undefined && { startDate:         new Date(body.startDate) }),
        ...(body.endDate           !== undefined && { endDate:           new Date(body.endDate) }),
        ...(body.location          !== undefined && { location:          body.location }),
        ...(body.maxParticipants   !== undefined && { maxParticipants:   body.maxParticipants }),
        ...(body.assessmentRequired !== undefined && { assessmentRequired: body.assessmentRequired }),
        ...(body.assessmentType    !== undefined && { assessmentType:    body.assessmentType }),
        ...(body.passingScore      !== undefined && { passingScore:      body.passingScore }),
        ...(body.maxAttempts       !== undefined && { maxAttempts:       body.maxAttempts }),
        ...(body.autoCertificate   !== undefined && { autoCertificate:   body.autoCertificate }),
        ...(body.assignmentMethod  !== undefined && { assignmentMethod:  body.assignmentMethod }),
        ...(body.dueDate           !== undefined && { dueDate:           new Date(body.dueDate) }),
        ...(body.notifyEmployees   !== undefined && { notifyEmployees:   body.notifyEmployees }),
      },
    })

    return withCors(ApiResponse.success(updated, 'Training program updated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// DELETE /api/training-programs/:id  (soft delete)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['ADMIN', 'SUPER_ADMIN'])

    const program = await findProgram(params.id, user.companyId!)
    if (!program) return withCors(ApiResponse.error('Training program not found', 404), origin)

    await prisma.trainingProgram.update({ where: { id: program.id }, data: { deletedAt: new Date() } })
    return withCors(ApiResponse.success(null, 'Training program deleted'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
