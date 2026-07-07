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
          plan: { select: { id: true, name: true, rounds: { select: { id: true, order: true, title: true }, orderBy: { order: 'asc' } } } },
        },
        orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
    ])

    const data = assessments.map(a => {
      const currentRound = a.plan.rounds.find((r: any) => r.order === a.currentRoundOrder)
      return {
        candidateId: a.application?.candidateId,
        applicationId: a.applicationId,
        name: `${a.application?.candidate?.firstName || ''} ${a.application?.candidate?.lastName || ''}`.trim(),
        email: a.application?.candidate?.email || '',
        role: a.application?.job?.title || 'Unknown',
        assignedPlan: { id: a.plan.id, name: a.plan.name },
        currentRound: currentRound ? { id: currentRound.id, order: currentRound.order, title: currentRound.title } : null,
        roundStatus: a.roundStatus,
        averageScore: a.averageScore,
      }
    })

    return withCors(ApiResponse.success(data, 'Success', 200), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
