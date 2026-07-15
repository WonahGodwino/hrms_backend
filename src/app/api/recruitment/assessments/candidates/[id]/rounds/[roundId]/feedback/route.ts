// GET /api/recruitment/assessments/candidates/:id/rounds/:roundId/feedback
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest, { params }: { params: { id: string; roundId: string } }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    // Only FINAL (non-draft) evaluations count as official feedback.
    const where: any = { candidateAssessmentId: params.id, roundId: params.roundId, submittedAt: { not: null } }
    if (companyId) where.candidateAssessment = { companyId }

    const evaluations = await prisma.recruitmentScorecard.findMany({ where })

    if (evaluations.length === 0)
      return withCors(ApiResponse.success({ overallAverage: 0, aggregatedSkills: [], history: [] }), origin)

    // Aggregate scores
    const scoresMap: Record<string, number[]> = {}
    evaluations.forEach(e => {
      const s = e.scores as Record<string, number>
      Object.entries(s).forEach(([k, v]) => {
        if (!scoresMap[k]) scoresMap[k] = []
        scoresMap[k].push(v)
      })
    })

    const aggregatedSkills = Object.entries(scoresMap).map(([label, vals]) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length
      const maxScore = 5
      return { label, score: parseFloat(avg.toFixed(1)), percent: Math.round((avg / maxScore) * 100) }
    })

    const allScores = evaluations.flatMap(e => Object.values(e.scores as Record<string, number>))
    const overallAverage = allScores.length > 0 ? parseFloat((allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)) : 0

    const history = evaluations.map(e => ({
      interviewerName: e.interviewerId,
      interviewerRole: 'Interviewer',
      decision: e.recommendation,
      comment: e.notes,
      scores: e.scores,
    }))

    return withCors(ApiResponse.success({ overallAverage, aggregatedSkills, history }), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
