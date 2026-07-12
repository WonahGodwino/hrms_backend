// POST /api/recruitment/offers/:id/respond
// Records the candidate's response to a dispatched offer (HR marks it on their
// behalf from the tracking drawer): ACCEPTED or DECLINED. Transitions the offer
// and keeps the application status in step.
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

    const offer = await prisma.offer.findFirst({ where: { id, companyId } })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const body = await request.json().catch(() => ({}))
    const decision = String(body.decision || '').toUpperCase()
    if (!['ACCEPTED', 'DECLINED'].includes(decision))
      return withCors(ApiResponse.error("decision must be 'ACCEPTED' or 'DECLINED'", 400), origin)

    const now = new Date()
    const meta = (offer.metadata && typeof offer.metadata === 'object') ? offer.metadata as any : {}

    await prisma.offer.update({
      where: { id },
      data: {
        status: decision as any,
        ...(decision === 'ACCEPTED'
          ? { acceptedAt: now }
          : { declinedAt: now, rejectionReason: body.notes || null }),
        updatedBy: user.userId,
        metadata: {
          ...meta,
          respondedAt: now.toISOString(),
          displayStatus: decision === 'ACCEPTED' ? 'Accepted' : 'Declined',
        } as any,
      },
    })

    // Keep the pipeline application status aligned with the offer outcome.
    if (offer.applicationId) {
      await prisma.jobApplication.update({
        where: { id: offer.applicationId },
        data: { status: decision === 'ACCEPTED' ? 'HIRED' : 'REJECTED', updatedBy: user.userId },
      }).catch(() => {})
    }

    return withCors(ApiResponse.success(
      { offerId: id, status: decision },
      decision === 'ACCEPTED' ? 'Offer marked as accepted.' : 'Offer marked as declined.',
    ), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
