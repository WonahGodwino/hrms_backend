// POST /api/recruitment/offers/:id/request-approval
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
    const body = await request.json()
    const { routingMode, approvers, internalNotes } = body
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    if (!approvers?.length) return withCors(ApiResponse.error('At least one approver is required', 400), origin)

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
      include: { approvals: { where: { status: { in: ['PENDING', 'AWAITING_PREVIOUS'] } } } },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)
    if (offer.approvals.length > 0) return withCors(ApiResponse.error('Approval chain already active', 409), origin)

    const isSequential = routingMode === 'sequential'

    // Create approval steps using RecruitmentOfferApproval model
    const steps = await Promise.all(
      approvers.map((a: any, i: number) =>
        prisma.recruitmentOfferApproval.create({
          data: {
            offerId: params.id,
            approverId: a.userId, approverRole: a.role,
            step: a.order || i + 1,
            status: isSequential && i > 0 ? 'AWAITING_PREVIOUS' : 'PENDING',
          },
        })
      )
    )

    // Update offer routing info
    await prisma.offer.update({
      where: { id: params.id },
      data: { routingMode: routingMode || 'SEQUENTIAL', internalNotes: internalNotes || null, status: 'PENDING_APPROVAL' },
    })

    return withCors(ApiResponse.success({
      offerId: offer.id,
      status: 'PENDING_APPROVAL',
      routingMode: routingMode || 'sequential',
      approvalChain: steps.map(s => ({ userId: s.approverId, status: s.status, step: s.step })),
    }, 'Approval chain configured and sequential routing initiated.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
