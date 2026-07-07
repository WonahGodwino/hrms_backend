// POST /api/recruitment/offers/:id/approve
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
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN', 'STAFF', 'MANAGER'])
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) return withCors(ApiResponse.error('Company ID is required', 400), origin)

    const offer = await prisma.offer.findFirst({
      where: { id: params.id, companyId },
      include: { approvals: { orderBy: { step: 'asc' } } },
    })
    if (!offer) return withCors(ApiResponse.error('Offer not found', 404), origin)

    // Verify user is in the approval chain
    const userStep = offer.approvals.find(s => s.approverId === user.userId)
    if (!userStep) return withCors(ApiResponse.error('You are not in the approval chain for this offer', 403), origin)
    if (userStep.status === 'APPROVED') return withCors(ApiResponse.error('You have already approved this offer', 409), origin)

    const body = await request.json()

    // Approve this step
    await prisma.recruitmentOfferApproval.update({
      where: { id: userStep.id },
      data: { status: 'APPROVED', notes: body.notes || null, actedAt: new Date() },
    })

    // Check if all steps are now approved
    const updatedSteps = await prisma.recruitmentOfferApproval.findMany({
      where: { offerId: params.id }, orderBy: { step: 'asc' },
    })
    const allApproved = updatedSteps.every(s => s.status === 'APPROVED')

    if (allApproved) {
      await prisma.offer.update({
        where: { id: params.id }, data: { status: 'APPROVED' },
      })
    } else {
      // Unlock next sequential approver
      const nextStep = updatedSteps.find(s => s.status === 'AWAITING_PREVIOUS')
      if (nextStep) {
        await prisma.recruitmentOfferApproval.update({
          where: { id: nextStep.id }, data: { status: 'PENDING' },
        })
      }
    }

    return withCors(ApiResponse.success({
      offerId: offer.id, status: allApproved ? 'APPROVED' : 'PENDING_APPROVAL',
    }, 'Offer approved.'), origin)
  } catch (error) { return withCors(handleApiError(error), origin) }
}
