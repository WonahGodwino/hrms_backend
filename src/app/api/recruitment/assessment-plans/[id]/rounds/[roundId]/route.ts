// PATCH /api/recruitment/assessment-plans/:id/rounds/:roundId — update round
// DELETE /api/recruitment/assessment-plans/:id/rounds/:roundId — delete round
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function PATCH(request: NextRequest, { params }: { params: { id: string; roundId: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    // For round operations, authorization is inherited from the plan's company
    // The plan lookup below scopes to the correct planId

    const round = await prisma.recruitmentAssessmentRound.findFirst({
      where: { id: params.roundId, planId: params.id },
    })
    if (!round) return withCors(ApiResponse.error('Round not found', 404), origin)

    const body = await request.json()
    const update: any = {}
    if (body.title !== undefined) update.title = body.title
    if (body.interviewType !== undefined) update.interviewType = body.interviewType
    if (body.duration !== undefined) update.duration = body.duration
    if (body.gradingMetric !== undefined) update.gradingMetric = body.gradingMetric
    if (body.questionBanks !== undefined) update.questionBanks = body.questionBanks
    if (body.requiredInterviewers !== undefined) update.requiredInterviewers = body.requiredInterviewers
    // Optional evaluation plan (empty string clears it).
    if (body.evaluationPlan !== undefined) {
      update.evaluationPlan = body.evaluationPlan ? String(body.evaluationPlan) : null
    }

    const updated: any = await (prisma as any).recruitmentAssessmentRound.update({
      where: { id: params.roundId }, data: update,
    })

    return withCors(ApiResponse.success({
      id: updated.id, title: updated.title, duration: updated.duration,
      interviewType: updated.interviewType, gradingMetric: updated.gradingMetric,
      requiredInterviewers: updated.requiredInterviewers, questionBanks: updated.questionBanks,
      evaluationPlan: updated.evaluationPlan ?? null,
    }, 'Round updated successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; roundId: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const round = await prisma.recruitmentAssessmentRound.findFirst({
      where: { id: params.roundId, planId: params.id },
    })
    if (!round) return withCors(ApiResponse.error('Round not found', 404), origin)

    await prisma.recruitmentAssessmentRound.delete({ where: { id: params.roundId } })

    // Reorder remaining rounds
    const remaining = await prisma.recruitmentAssessmentRound.findMany({
      where: { planId: params.id }, orderBy: { order: 'asc' },
    })
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i + 1) {
        await prisma.recruitmentAssessmentRound.update({
          where: { id: remaining[i].id }, data: { order: i + 1 },
        })
      }
    }

    return withCors(ApiResponse.success(null, 'Assessment round removed successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
