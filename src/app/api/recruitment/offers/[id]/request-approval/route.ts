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
      include: { approvals: { orderBy: { step: 'asc' } } },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    const isSequential = routingMode !== 'parallel' // default to sequential

    // Preserve steps that have ALREADY been approved — reassigning only changes
    // the steps still outstanding, and never undoes a completed approval.
    const approvedSteps = offer.approvals
      .filter((s) => s.status === 'APPROVED')
      .sort((a, b) => a.step - b.step)
    const approvedIds = new Set(approvedSteps.map((s) => s.approverId))

    // Remove only the not-yet-approved steps (PENDING / AWAITING_PREVIOUS).
    await prisma.recruitmentOfferApproval.deleteMany({
      where: { offerId: params.id, status: { not: 'APPROVED' } },
    })

    // Renumber the kept (approved) steps to 1..k so numbering stays contiguous.
    for (let i = 0; i < approvedSteps.length; i++) {
      if (approvedSteps[i].step !== i + 1) {
        await prisma.recruitmentOfferApproval.update({
          where: { id: approvedSteps[i].id }, data: { step: i + 1 },
        })
      }
    }

    // New approvers for the remaining steps — drop anyone who already approved
    // (their completed step is kept) and de-duplicate.
    const seen = new Set<string>()
    const newApprovers = (approvers as any[])
      .filter((a) => a?.userId && !approvedIds.has(a.userId) && !seen.has(a.userId) && seen.add(a.userId))
    if (newApprovers.length === 0) {
      return withCors(ApiResponse.error('The selected approver(s) have already approved this offer. Choose someone who has not yet approved.', 400), origin)
    }

    const base = approvedSteps.length
    const created = await Promise.all(
      newApprovers.map((a, i) =>
        prisma.recruitmentOfferApproval.create({
          data: {
            offerId: params.id,
            approverId: a.userId, approverName: a.name || null, approverRole: a.role,
            step: base + i + 1,
            // Sequential: the first outstanding step (after all kept approvals) is
            // live; the rest wait their turn. Parallel: all outstanding are live.
            status: isSequential && i > 0 ? 'AWAITING_PREVIOUS' : 'PENDING',
          },
        }),
      ),
    )

    await prisma.offer.update({
      where: { id: params.id },
      data: {
        routingMode: (isSequential ? 'SEQUENTIAL' : 'PARALLEL') as any,
        internalNotes: internalNotes ?? offer.internalNotes ?? null,
        status: 'PENDING_APPROVAL',
      },
    })

    return withCors(ApiResponse.success({
      offerId: offer.id,
      status: 'PENDING_APPROVAL',
      routingMode: isSequential ? 'sequential' : 'parallel',
      preservedApprovedSteps: approvedSteps.length,
      approvalChain: [
        ...approvedSteps.map((s, i) => ({ userId: s.approverId, status: 'APPROVED', step: i + 1 })),
        ...created.map((s) => ({ userId: s.approverId, status: s.status, step: s.step })),
      ],
    }, approvedSteps.length
      ? `Remaining approver(s) reassigned. ${approvedSteps.length} completed approval(s) kept.`
      : 'Approval chain configured.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
