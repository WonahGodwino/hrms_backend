import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

async function getAssessment(assessmentId: string, companyId: string) {
  return prisma.assessment.findFirst({ where: { id: assessmentId, companyId, deletedAt: null }, select: { id: true } })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; qid: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    if (!await getAssessment(params.id, user.companyId!))
      return withCors(ApiResponse.error('Assessment not found', 404), origin)

    const question = await prisma.question.findFirst({ where: { id: params.qid, assessmentId: params.id } })
    if (!question) return withCors(ApiResponse.error('Question not found', 404), origin)

    const body = await req.json()
    const updated = await prisma.question.update({
      where: { id: params.qid },
      data: {
        ...(body.title              !== undefined && { title:              body.title }),
        ...(body.type               !== undefined && { type:               body.type }),
        ...(body.prompt             !== undefined && { prompt:             body.prompt }),
        ...(body.options            !== undefined && { options:            body.options }),
        ...(body.correctOptionId    !== undefined && { correctOptionId:    body.correctOptionId }),
        ...(body.correctBoolean     !== undefined && { correctBoolean:     body.correctBoolean }),
        ...(body.explanation        !== undefined && { explanation:        body.explanation }),
        ...(body.points             !== undefined && { points:             body.points }),
        ...(body.difficulty         !== undefined && { difficulty:         body.difficulty }),
        ...(body.tags               !== undefined && { tags:               body.tags }),
        ...(body.required           !== undefined && { required:           body.required }),
        ...(body.shuffleAnswers     !== undefined && { shuffleAnswers:     body.shuffleAnswers }),
        ...(body.multipleSelections !== undefined && { multipleSelections: body.multipleSelections }),
        ...(body.order              !== undefined && { order:              body.order }),
      },
    })
    return withCors(ApiResponse.success(updated, 'Question updated'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; qid: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    if (!await getAssessment(params.id, user.companyId!))
      return withCors(ApiResponse.error('Assessment not found', 404), origin)

    const question = await prisma.question.findFirst({ where: { id: params.qid, assessmentId: params.id } })
    if (!question) return withCors(ApiResponse.error('Question not found', 404), origin)

    await prisma.question.delete({ where: { id: params.qid } })
    return withCors(ApiResponse.success(null, 'Question deleted'), origin)
  } catch (e) { return withCors(handleApiError(e), origin) }
}
