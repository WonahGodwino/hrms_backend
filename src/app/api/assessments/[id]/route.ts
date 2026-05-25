import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])
    const isAdmin = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)

    const assessment = await prisma.assessment.findFirst({
      where: { id: params.id, companyId: user.companyId, deletedAt: null },
      include: {
        trainingProgram: { select: { id: true, programName: true } },
        questions: {
          select: {
            id: true, order: true, title: true, type: true, prompt: true,
            options: true, points: true, difficulty: true, tags: true,
            required: true, shuffleAnswers: true, multipleSelections: true,
            // Only admins see correct answers in the assessment detail view
            ...(isAdmin && { correctOptionId: true, correctBoolean: true, explanation: true }),
          },
          orderBy: { order: 'asc' },
        },
        _count: { select: { attempts: true } },
      },
    })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)
    return withCors(ApiResponse.success(assessment), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const assessment = await prisma.assessment.findFirst({ where: { id: params.id, companyId: user.companyId, deletedAt: null } })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)

    const body = await req.json()
    const updated = await prisma.assessment.update({
      where: { id: params.id },
      data: {
        ...(body.name             !== undefined && { name:             body.name }),
        ...(body.type             !== undefined && { type:             body.type }),
        ...(body.description      !== undefined && { description:      body.description }),
        ...(body.timeLimitMinutes !== undefined && { timeLimitMinutes: body.timeLimitMinutes }),
        ...(body.passingScore     !== undefined && { passingScore:     body.passingScore }),
        ...(body.maxAttempts      !== undefined && { maxAttempts:      body.maxAttempts }),
        ...(body.category         !== undefined && { category:         body.category }),
        ...(body.difficulty       !== undefined && { difficulty:       body.difficulty }),
        ...(body.shuffleQuestions !== undefined && { shuffleQuestions: body.shuffleQuestions }),
      },
    })
    return withCors(ApiResponse.success(updated, 'Assessment updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['ADMIN', 'SUPER_ADMIN'])

    const assessment = await prisma.assessment.findFirst({ where: { id: params.id, companyId: user.companyId, deletedAt: null } })
    if (!assessment) return withCors(ApiResponse.error('Assessment not found', 404), origin)

    await prisma.assessment.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
    return withCors(ApiResponse.success(null, 'Assessment deleted'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
