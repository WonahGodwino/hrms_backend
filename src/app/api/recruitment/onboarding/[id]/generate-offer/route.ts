// POST /api/recruitment/onboarding/:id/generate-offer
// The new "ready to offer" gate-crossing action — replaces the old behavior
// where proceed-to-offer created a draft Offer immediately after the final
// interview round. Now a DRAFT Offer is only created once the candidate has
// cleared every pre-offer onboarding gate (checklist, handbook, agreement).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const companyId = new URL(request.url).searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)
    const actor = user.userId || user.email || 'system'

    const onboarding = await prisma.onboarding.findFirst({
      where: { id, companyId },
      include: { application: { select: { id: true, candidateId: true, jobId: true } } },
    })
    if (!onboarding) return withCors(ApiResponse.error('Onboarding not found', 404), origin)
    if (onboarding.offerId) return withCors(ApiResponse.error('An offer has already been generated for this onboarding', 409), origin)

    // Re-check readiness server-side — never trust a client-side flag.
    const [totalTasks, openTasks] = await Promise.all([
      prisma.onboardingTask.count({ where: { onboardingId: id, archived: 0 } }),
      prisma.onboardingTask.count({ where: { onboardingId: id, archived: 0, status: { not: 'DONE' } } }),
    ])
    if (totalTasks === 0 || openTasks > 0) {
      return withCors(ApiResponse.error('All checklist tasks must be completed before generating the offer', 409), origin)
    }
    if (!onboarding.handbookAcknowledgedAt) {
      return withCors(ApiResponse.error('The candidate has not yet acknowledged the company handbook', 409), origin)
    }
    if (!onboarding.candidateAgreedAt) {
      return withCors(ApiResponse.error('The candidate has not yet given their final compliance agreement', 409), origin)
    }

    const application = onboarding.application!
    const offer = await prisma.offer.create({
      data: {
        companyId,
        candidateId: application.candidateId,
        applicationId: application.id,
        jobId: application.jobId,
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

    await prisma.$transaction([
      prisma.onboarding.update({ where: { id }, data: { offerId: offer.id, updatedBy: actor } }),
      prisma.jobApplication.update({ where: { id: application.id }, data: { status: 'OFFERED', updatedBy: actor } }),
    ])

    return withCors(ApiResponse.success({
      onboardingId: id,
      offerId: offer.id,
      applicationId: application.id,
    }, 'Pre-offer onboarding complete. A draft offer is ready in the Offers workspace.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
