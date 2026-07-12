// GET /api/recruitment/assessments/my-interviews
// Lists assessment rounds the current user is assigned to interview (scheduled or
// awaiting their feedback), for the interviewer-facing dashboard.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const assessments = await prisma.recruitmentCandidateAssessment.findMany({
      where: {
        companyId,
        roundStatus: { in: ['SCHEDULED', 'PENDING_FEEDBACK'] },
        interviewerIds: { array_contains: user.userId },
      },
      include: {
        application: {
          select: {
            candidateId: true,
            job: { select: { title: true } },
            candidate: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        plan: {
          select: {
            id: true, name: true,
            rounds: {
              select: {
                id: true, order: true, title: true, duration: true,
                interviewType: true, gradingMetric: true, requiredInterviewers: true,
              },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    })

    // Rounds the current user has already scored (to hide the evaluate CTA).
    const scorecards = await prisma.recruitmentScorecard.findMany({
      where: { interviewerId: user.userId, candidateAssessmentId: { in: assessments.map(a => a.id) } },
      select: { candidateAssessmentId: true, roundId: true },
    })
    const submitted = new Set(scorecards.map(s => `${s.candidateAssessmentId}:${s.roundId}`))

    const data = assessments.map(a => {
      const currentRound = a.plan.rounds.find((r: any) => r.order === a.currentRoundOrder)
      const c = a.application?.candidate
      return {
        id: a.id,
        candidateId: a.application?.candidateId,
        applicationId: a.applicationId,
        name: c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : 'Candidate',
        email: c?.email || '',
        role: a.application?.job?.title || 'Unknown',
        planName: a.plan.name,
        currentRound: currentRound
          ? {
              id: currentRound.id,
              order: currentRound.order,
              title: currentRound.title,
              duration: currentRound.duration,
              interviewType: currentRound.interviewType,
              gradingMetric: currentRound.gradingMetric,
            }
          : null,
        roundStatus: a.roundStatus,
        scheduledAt: a.scheduledAt ? a.scheduledAt.toISOString() : null,
        hasSubmitted: currentRound ? submitted.has(`${a.id}:${currentRound.id}`) : false,
      }
    })

    return withCors(ApiResponse.success(data, 'Success', 200), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
