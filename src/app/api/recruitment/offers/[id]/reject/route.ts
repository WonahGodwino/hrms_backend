// POST /api/recruitment/offers/:id/reject — internally reject and send back to draft
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(request: NextRequest) { return handleCorsOptions(request) }

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = request.headers.get('origin')
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN', 'STAFF', 'MANAGER'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const offer = await forCompany(companyId).offer.findFirst({
      where: { id: params.id },
      include: { approvals: { orderBy: { step: 'asc' } } },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const body = await request.json().catch(() => ({}))

    // HR/ADMIN/SUPER_ADMIN may reject directly even when not a named approver.
    const userStep = offer.approvals.find(s => s.approverId === user.userId)
    const canOverride = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)
    if (!userStep && !canOverride)
      return withCors(ApiResponse.error('You are not in the approval chain for this offer', 403), origin)

    // DB-002: the approval chain and the offer status change together.
    await prisma.$transaction(async (tx) => {
      if (userStep) {
        // Mark this step as rejected, reset the others.
        await tx.recruitmentOfferApproval.update({
          where: { id: userStep.id },
          data: { status: 'REJECTED', notes: body.reason || 'Rejected', actedAt: new Date() },
        })
        await tx.recruitmentOfferApproval.updateMany({
          where: { offerId: params.id, id: { not: userStep.id } },
          data: { status: 'AWAITING_PREVIOUS', notes: null, actedAt: null },
        })
      } else {
        // Override reject: mark the whole chain rejected.
        await tx.recruitmentOfferApproval.updateMany({
          where: { offerId: params.id },
          data: { status: 'REJECTED', notes: body.reason || 'Rejected', actedAt: new Date() },
        })
      }

      // Revert offer to DRAFT
      await tx.offer.update({
        where: { id: params.id },
        data: { status: 'DRAFT', rejectionReason: body.reason || null },
      })
    })

    return withCors(ApiResponse.success({
      offerId: offer.id, status: 'DRAFT',
    }, 'Offer rejected. Returned to drafting workspace.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
