// POST /api/recruitment/offers/:id/respond
// Records the candidate's response to a dispatched offer (HR marks it on their
// behalf from the tracking drawer): ACCEPTED or DECLINED. Transitions the offer
// and keeps the application status in step.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { promoteCandidateToStaff, PromoteCandidateError } from '@/app/lib/staff/promote-candidate-to-staff'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const companyId = new URL(request.url).searchParams.get('companyId') || body.companyId || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company context missing', 400), origin)

    const offer = await prisma.offer.findFirst({ where: { id, companyId } })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

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

    // Decline keeps the pipeline application status in step. Acceptance's
    // status transition (HIRED) happens inside promoteCandidateToStaff below,
    // alongside the actual StaffRecord creation.
    if (decision === 'DECLINED' && offer.applicationId) {
      await prisma.jobApplication.update({
        where: { id: offer.applicationId },
        data: { status: 'REJECTED', updatedBy: user.userId },
      }).catch(() => {})
    }

    let staffRecordId: string | null = null
    let staffId: string | null = null
    if (decision === 'ACCEPTED') {
      const onboarding = await prisma.onboarding.findUnique({ where: { offerId: offer.id } })
      if (!onboarding) {
        return withCors(ApiResponse.error('No pre-offer onboarding record found for this offer — cannot complete hire.', 409), origin)
      }
      try {
        const result = await promoteCandidateToStaff({
          onboardingId: onboarding.id,
          companyId,
          actor: user.userId || user.email || 'system',
        })
        staffRecordId = result.staffRecordId
        staffId = result.staffId
      } catch (promoteError) {
        if (promoteError instanceof PromoteCandidateError) {
          return withCors(ApiResponse.error(promoteError.message, promoteError.status), origin)
        }
        throw promoteError
      }
    }

    return withCors(ApiResponse.success(
      { offerId: id, status: decision, staffRecordId, staffId },
      decision === 'ACCEPTED' ? 'Offer marked as accepted. The employee has been added to staff records.' : 'Offer marked as declined.',
    ), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
