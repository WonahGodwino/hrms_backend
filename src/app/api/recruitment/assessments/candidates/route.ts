// GET /api/recruitment/assessments/candidates — list candidates in assessment queue
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
    const queryCompanyId = searchParams.get('companyId')
    const companyId = queryCompanyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const search = searchParams.get('search')
    const jobId = searchParams.get('jobId')
    const roundStatus = searchParams.get('roundStatus')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))

    const where: any = { companyId }
    if (roundStatus && ['AWAITING_SCHEDULING', 'SCHEDULED', 'PENDING_FEEDBACK', 'COMPLETED'].includes(roundStatus))
      where.roundStatus = roundStatus

    // Only return SHORTLISTED candidates
    where.application = { status: 'SHORTLISTED' }
    if (jobId) where.application.jobId = jobId

    const [total, assessments] = await Promise.all([
      prisma.recruitmentCandidateAssessment.count({ where }),
      prisma.recruitmentCandidateAssessment.findMany({
        where,
        include: {
          application: {
            select: {
              candidateId: true,
              jobId: true,
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
                  interviewType: true, gradingMetric: true,
                  requiredInterviewers: true, questionBanks: true,
                },
                orderBy: { order: 'asc' },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
    ])

    const data = assessments.map(a => {
      const currentRound = a.plan.rounds.find((r: any) => r.order === a.currentRoundOrder)
      return {
        id: a.id,
        candidateId: a.application?.candidateId,
        applicationId: a.applicationId,
        name: `${a.application?.candidate?.firstName || ''} ${a.application?.candidate?.lastName || ''}`.trim(),
        email: a.application?.candidate?.email || '',
        role: a.application?.job?.title || 'Unknown',
        assignedPlan: { id: a.plan.id, name: a.plan.name },
        currentRoundOrder: a.currentRoundOrder,
        totalRounds: a.plan.rounds.length,
        currentRound: currentRound
          ? {
              id: currentRound.id,
              order: currentRound.order,
              title: currentRound.title,
              duration: currentRound.duration,
              interviewType: currentRound.interviewType,
              gradingMetric: currentRound.gradingMetric,
              requiredInterviewers: currentRound.requiredInterviewers,
              questionBanks: currentRound.questionBanks,
            }
          : null,
        roundStatus: a.roundStatus,
        averageScore: a.averageScore,
        scheduledAt: a.scheduledAt ? a.scheduledAt.toISOString() : null,
        interviewerIds: a.interviewerIds || [],
      }
    })

    return withCors(ApiResponse.success(data, 'Success', 200), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}

// POST /api/recruitment/assessments/candidates — move a shortlisted candidate into
// an assessment plan (creates the candidate-assessment record that feeds the queue).
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const body = await request.json().catch(() => ({}))
    const applicationId = String(body.applicationId || '').trim()
    const planId = String(body.planId || '').trim()
    if (!applicationId || !planId)
      return withCors(ApiResponse.error('applicationId and planId are required', 400), origin)

    const application = await prisma.jobApplication.findFirst({
      where: { id: applicationId, companyId },
      include: {
        candidateAssessment: { select: { id: true } },
        candidate: { select: { firstName: true, lastName: true, email: true } },
      },
    })
    if (!application) return withCors(ApiResponse.error('Application not found', 404), origin)
    if (application.status !== 'SHORTLISTED')
      return withCors(ApiResponse.error('Only shortlisted candidates can be moved to assessment', 400), origin)
    if (application.candidateAssessment)
      return withCors(ApiResponse.error('This candidate is already in an assessment plan', 409), origin)

    const plan = await prisma.recruitmentAssessmentPlan.findFirst({
      where: { id: planId, companyId, archived: 0 },
      include: { rounds: { orderBy: { order: 'asc' }, take: 1 } },
    })
    if (!plan) return withCors(ApiResponse.error('Assessment plan not found', 404), origin)
    if (plan.status !== 'ACTIVE')
      return withCors(ApiResponse.error('The assessment plan must be published before assigning candidates', 400), origin)
    if (plan.rounds.length === 0)
      return withCors(ApiResponse.error('The assessment plan has no rounds configured', 400), origin)

    const assessment = await prisma.recruitmentCandidateAssessment.create({
      data: {
        companyId,
        applicationId,
        planId,
        currentRoundOrder: 1,
        roundStatus: 'AWAITING_SCHEDULING',
        createdBy: user.userId,
      },
    })

    const firstRound = plan.rounds[0]
    return withCors(ApiResponse.success({
      id: assessment.id,
      candidateId: application.candidateId,
      applicationId,
      name: `${application.candidate?.firstName || ''} ${application.candidate?.lastName || ''}`.trim(),
      assignedPlan: { id: plan.id, name: plan.name },
      currentRound: { id: firstRound.id, order: firstRound.order, title: firstRound.title },
      roundStatus: 'AWAITING_SCHEDULING',
    }, 'Candidate moved to assessment.', 201), origin)
  } catch (error: any) {
    if (error?.code === 'P2002')
      return withCors(ApiResponse.error('This candidate is already in an assessment plan', 409), origin)
    return withCors(handleApiError(error), origin)
  }
}
