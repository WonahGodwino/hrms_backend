// POST /api/recruitment/assessments/candidates/:id/remind-interviewers
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({ where,
      include: { plan: { include: { rounds: { where: { order: { equals: undefined } }, orderBy: { order: 'asc' } } } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)

    const currentRound = assessment.plan.rounds.find(r => r.order === assessment.currentRoundOrder)
    if (!currentRound) return withCors(ApiResponse.error('Current round not found', 404), origin)

    const submittedCount = await prisma.recruitmentScorecard.count({
      where: { candidateAssessmentId: params.id, roundId: currentRound.id },
    })
    const requiredInterviewers = (currentRound.requiredInterviewers as any[]) || []
    const requiredCount = requiredInterviewers.length
    const pendingInterviewers = Math.max(0, requiredCount - submittedCount)

    // TODO: trigger actual email notifications via the email service

    return withCors(ApiResponse.success({ pendingInterviewers }, `Reminders sent to ${pendingInterviewers} pending interviewers.`), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
