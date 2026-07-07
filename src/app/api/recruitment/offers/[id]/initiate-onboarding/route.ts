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
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)
    if (offer.status !== 'ACCEPTED')
      return withCors(ApiResponse.error('Offer not yet accepted', 400), origin)

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

    return withCors(ApiResponse.success({
      offerId: offer.id,
      onboardingId: onboarding.id,
      status: 'ONBOARDING_INITIATED',
    }, 'Handoff successful. Onboarding record created.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
