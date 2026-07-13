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
    const user = await requireRoleAsync(token, ['ADMIN', 'HR', 'SUPER_ADMIN', 'STAFF'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const body = await request.json()
    const { scores, notes, recommendation, draft } = body
    const isDraft = draft === true
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

    // Final submission: check for existing and lock it.
    if (!isDraft) {
      const existing = await prisma.recruitmentScorecard.findFirst({
        where: { candidateAssessmentId: params.id, roundId: params.roundId, interviewerId: user.userId },
        select: { id: true },
      })
      if (existing) {
        return withCors(ApiResponse.error('You have already submitted your final evaluation for this round. It cannot be changed.', 409), origin)
      }
    }

    // Upsert: draft updates, final create (locked by the check above)
    if (isDraft) {
      await prisma.recruitmentScorecard.upsert({
        where: { candidateAssessmentId_roundId_interviewerId: { candidateAssessmentId: params.id, roundId: params.roundId, interviewerId: user.userId } },
        create: {
          candidateAssessmentId: params.id, roundId: params.roundId, interviewerId: user.userId,
          scores: scores as any, notes: notes || null,
          recommendation: recommendation === 'hire' ? 'HIRE' : recommendation === 'no_hire' ? 'NO_HIRE' : 'MAYBE',
        },
        update: {
          scores: scores as any, notes: notes || null,
          recommendation: recommendation === 'hire' ? 'HIRE' : recommendation === 'no_hire' ? 'NO_HIRE' : 'MAYBE',
        },
      })
    } else {
      await prisma.recruitmentScorecard.create({
        data: {
          candidateAssessmentId: params.id, roundId: params.roundId, interviewerId: user.userId,
          scores: scores as any, notes: notes || null,
          recommendation: recommendation === 'hire' ? 'HIRE' : recommendation === 'no_hire' ? 'NO_HIRE' : 'MAYBE',
          submittedAt: new Date(),
        },
      })
    }

    // Only count final (non-draft) submissions for round completion
    const requiredInterviewers = (round.requiredInterviewers || []) as string[]
    const allScorecards = await prisma.recruitmentScorecard.findMany({
      where: { candidateAssessmentId: params.id, roundId: params.roundId },
      select: { id: true, submittedAt: true },
    })
    const submitted = allScorecards.filter((s) => s.submittedAt !== null).length

    let isRoundComplete = requiredInterviewers.length > 0 && submitted >= requiredInterviewers.length

    // Deadline bypass: if round has evaluationDeadlineHours set and assessment
    // was scheduled, check whether the deadline has passed.
    if (!isRoundComplete && round.evaluationDeadlineHours && assessment.scheduledAt) {
      const deadline = new Date(assessment.scheduledAt.getTime() + round.evaluationDeadlineHours * 3600000)
      if (new Date() >= deadline) {
        isRoundComplete = true
      }
    }

    if (isRoundComplete) {
      // Aggregate all scorecards for this round
      const allScorecards = await prisma.recruitmentScorecard.findMany({
        where: { candidateAssessmentId: params.id, roundId: params.roundId },
        select: { scores: true, recommendation: true, interviewerId: true, notes: true, submittedAt: true },
      })

      // Compute aggregated average scores
      const aggregatedScores: Record<string, number> = {}
      const scoreKeys = Object.keys(scores)
      for (const key of scoreKeys) {
        const values = allScorecards
          .map((sc) => (sc.scores as any)?.[key])
          .filter((v) => typeof v === 'number') as number[]
        aggregatedScores[key] = values.length > 0
          ? parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
          : 0
      }

      // Compute average overall score and dominant recommendation
      const avgScore = Object.values(aggregatedScores).length > 0
        ? parseFloat((Object.values(aggregatedScores).reduce((a, b) => a + b, 0) / Object.values(aggregatedScores).length).toFixed(1))
        : 0

      const hire = allScorecards.filter((s) => s.recommendation === 'HIRE').length
      const noHire = allScorecards.filter((s) => s.recommendation === 'NO_HIRE').length
      const maybe = allScorecards.filter((s) => s.recommendation === 'MAYBE').length
      const finalRecommendation = hire > noHire && hire > maybe ? 'HIRE'
        : noHire > hire && noHire > maybe ? 'NO_HIRE'
        : 'MAYBE'

      await prisma.recruitmentCandidateAssessment.update({
        where: { id: params.id },
        data: {
          roundStatus: 'COMPLETED',
          averageScore: avgScore,
        },
      })

      return withCors(ApiResponse.success({
        isRoundComplete: true,
        roundStatus: 'completed',
        pendingInterviewers: 0,
        averageScore: avgScore,
        finalRecommendation,
        scoreBreakdown: allScorecards.map((sc) => ({
          interviewerId: sc.interviewerId,
          scores: sc.scores,
          recommendation: sc.recommendation,
          notes: sc.notes,
          submittedAt: sc.submittedAt,
        })),
        aggregatedScores,
        message: submitted < requiredInterviewers.length
          ? 'Round completed — evaluation deadline has passed. Bypassed panelists who did not submit.'
          : 'All panelists have submitted. Evaluation complete.',
      }), origin)
    }
  } catch (error) { return withCors(handleApiError(error), origin) }
}
