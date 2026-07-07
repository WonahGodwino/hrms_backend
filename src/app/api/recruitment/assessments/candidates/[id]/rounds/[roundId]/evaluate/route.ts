// POST /api/recruitment/assessments/candidates/:id/rounds/:roundId/evaluate
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: { id: string; roundId: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['ADMIN', 'HR', 'SUPER_ADMIN', 'STAFF', 'MANAGER'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const body = await request.json()
    const { scores, notes, recommendation } = body
    if (!scores || typeof scores !== 'object') return withCors(ApiResponse.error('scores object is required', 400), origin)
    if (!recommendation || !['hire', 'no_hire', 'maybe'].includes(recommendation))
      return withCors(ApiResponse.error('recommendation must be hire, no_hire, or maybe', 400), origin)

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where: { id: params.id },
      include: { plan: { include: { rounds: { where: { id: params.roundId } } } } },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)

    const round = assessment.plan.rounds[0]
    if (!round) return withCors(ApiResponse.error('Round not found for this plan', 404), origin)

    // Upsert scorecard
    await prisma.recruitmentScorecard.upsert({
      where: { candidateAssessmentId_roundId_interviewerId: { candidateAssessmentId: params.id, roundId: params.roundId, interviewerId: user.userId } },
      create: { candidateAssessmentId: params.id, roundId: params.roundId, interviewerId: user.userId, scores: scores as any, notes: notes || null, recommendation: recommendation === 'hire' ? 'HIRE' : recommendation === 'no_hire' ? 'NO_HIRE' : 'MAYBE' },
      update: { scores: scores as any, notes: notes || null, recommendation: recommendation === 'hire' ? 'HIRE' : recommendation === 'no_hire' ? 'NO_HIRE' : 'MAYBE' },
    })

    // Check if all interviewers have submitted
    const requiredInterviewers = (round.requiredInterviewers || []) as string[]
    const submitted = await prisma.recruitmentScorecard.count({
      where: { candidateAssessmentId: params.id, roundId: params.roundId },
    })

    const isRoundComplete = requiredInterviewers.length > 0 && submitted >= requiredInterviewers.length
    if (isRoundComplete) {
      await prisma.recruitmentCandidateAssessment.update({
        where: { id: params.id }, data: { roundStatus: 'COMPLETED' },
      })
    }

    return withCors(ApiResponse.success({
      isRoundComplete,
      roundStatus: isRoundComplete ? 'completed' : 'pending_feedback',
      pendingInterviewers: Math.max(0, requiredInterviewers.length - submitted),
    }, 'Evaluation submitted successfully.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
