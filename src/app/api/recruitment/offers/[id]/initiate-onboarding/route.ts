// POST /api/recruitment/offers/:id/initiate-onboarding
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
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)
    if (offer.status !== 'ACCEPTED')
      return withCors(ApiResponse.error('Onboarding can only start once the candidate has accepted the offer.', 400), origin)

    // Idempotent: if onboarding already started for this offer, return it.
    const existing = await prisma.onboarding.findFirst({
      where: { offerId: offer.id, archived: 0 },
      select: { id: true, status: true },
    })
    if (existing) {
      return withCors(ApiResponse.success({
        offerId: offer.id, onboardingId: existing.id, status: 'ALREADY_STARTED',
      }, 'Onboarding already started for this offer.'), origin)
    }

    // Create onboarding record
    const onboarding = await prisma.onboarding.create({
      data: {
        companyId,
        offerId: offer.id,
        status: 'IN_PROGRESS',
        startDate: new Date(),
        createdBy: user.userId,
      },
    })

    // Attach any documents the candidate already uploaded post-acceptance.
    await (prisma as any).candidateDocument.updateMany({
      where: { candidateId: offer.candidateId, onboardingId: null, archived: 0 },
      data: { onboardingId: onboarding.id },
    }).catch(() => {})

    return withCors(ApiResponse.success({
      offerId: offer.id,
      onboardingId: onboarding.id,
      status: 'ONBOARDING_INITIATED',
    }, 'Handoff successful. Onboarding record created.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
