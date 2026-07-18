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
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const body = await request.json().catch(() => ({}))
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const where: any = { id: params.id }
    if (companyId) where.companyId = companyId

    const assessment = await prisma.recruitmentCandidateAssessment.findUnique({
      where: { id: params.id },
      include: {
        plan: { include: { rounds: { orderBy: { order: 'asc' } } } },
        application: { select: { candidateId: true, jobId: true, offer: { select: { id: true } } } },
      },
    })
    if (!assessment) return withCors(ApiResponse.error('Candidate assessment not found', 404), origin)

    if (assessment.currentRoundOrder !== assessment.plan.rounds.length)
      return withCors(ApiResponse.error('Candidate must be on the final round', 400), origin)
    if (assessment.roundStatus !== 'COMPLETED')
      return withCors(ApiResponse.error('Round must be completed before proceeding to offer', 400), origin)
    const actor = user.userId || user.email || 'system'

    await prisma.recruitmentCandidateAssessment.update({
      where: { id: params.id }, data: { roundStatus: 'COMPLETED' },
    })
    await prisma.jobApplication.update({
      where: { id: assessment.applicationId }, data: { status: 'OFFERED', updatedBy: actor },
    })

    // Create the draft offer so the approved candidate lands in the Offers
    // workspace ready to configure (skip if one already exists for this application).
    let offerId = assessment.application?.offer?.id || null
    if (!offerId) {
      try {
        const offer = await prisma.offer.create({
          data: {
            companyId,
            candidateId: assessment.application!.candidateId,
            applicationId: assessment.applicationId,
            jobId: assessment.application!.jobId,
            status: 'DRAFT',
            createdBy: actor,
            metadata: {
              configMode: 'TEMPLATE',
              displayStatus: 'DRAFT',
              source: 'ASSESSMENT_HANDOFF',
            } as any,
          },
          select: { id: true },
        })
        offerId = offer.id
      } catch (offerErr: any) {
        // Unique-constraint race (offer created concurrently) — non-fatal.
        if (offerErr?.code !== 'P2002') throw offerErr
      }
    }

    return withCors(ApiResponse.success({
      candidateId: assessment.application?.candidateId,
      applicationId: assessment.applicationId,
      offerId,
      roundStatus: 'COMPLETED', status: 'OFFERED',
    }, 'Candidate approved for offer. A draft offer is ready in the Offers workspace.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
