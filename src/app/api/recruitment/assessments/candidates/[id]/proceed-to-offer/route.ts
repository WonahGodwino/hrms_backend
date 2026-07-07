// POST /api/recruitment/assessments/candidates/:id/proceed-to-offer
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

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where: { id: params.id },
      include: {
        plan: { include: { rounds: { orderBy: { order: 'asc' } } } },
        application: { select: { candidateId: true } },
      },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)

    if (assessment.currentRoundOrder !== assessment.plan.rounds.length)
      return withCors(ApiResponse.error('Candidate must be on the final round', 400), origin)
    if (assessment.roundStatus !== 'COMPLETED')
      return withCors(ApiResponse.error('Round must be completed before proceeding to offer', 400), origin)

    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id }, data: { roundStatus: 'COMPLETED' },
    })
    await prisma.jobApplication.update({
      where: { id: assessment.applicationId }, data: { status: 'OFFERED' },
    })

    return withCors(ApiResponse.success({
      candidateId: assessment.application?.candidateId,
      applicationId: assessment.applicationId,
      roundStatus: 'COMPLETED', status: 'OFFERED',
    }, 'Candidate approved for offer. Handoff to Offer Workspace initiated.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
