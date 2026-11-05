// src/app/api/staff-loans-benefits/benefit-claims/[id]/pay/route.ts
// POST — final finance-processing step: marks an APPROVED claim PAID and
// draws down the source allocation's usage.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR'])
    const body = await request.json().catch(() => ({}))

    const claim = await prisma.benefitClaim.findUnique({ where: { id: params.id } })
    if (!claim) return withCors(ApiResponse.error('Claim not found', 404), origin)
    const hasAccess = await checkStaffAccess(user, claim.companyId)
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this claim', 403), origin)
    if (claim.status !== 'APPROVED') return withCors(ApiResponse.error('Only an approved claim can be paid', 400), origin)

    const paidAmount = body?.paidAmount ?? claim.amount

    const ops: any[] = [
      prisma.benefitClaim.update({ where: { id: claim.id }, data: { status: 'PAID', paidAt: new Date(), paidAmount } }),
    ]
    if (claim.benefitAllocationId) {
      ops.push(prisma.benefitAllocation.update({ where: { id: claim.benefitAllocationId }, data: { amountUsed: { increment: Number(paidAmount) } } }))
    }
    const [updated] = await prisma.$transaction(ops)

    await logStaffActivity({
      staffRecordId: claim.staffId,
      companyId: claim.companyId,
      action: 'BENEFIT_CLAIM_DECIDED',
      performedById: user.userId,
      performedByName: user.email,
      performedByRole: user.role,
      details: { benefitClaimId: claim.id, outcome: 'PAID', paidAmount },
    })

    await createNotification(
      claim.staffId,
      NOTIFICATION_TYPES.BENEFIT_CLAIM_PAID,
      'Your claim has been paid',
      `Your claim for ${claim.benefitName} has been paid.`,
      { benefitClaimId: claim.id },
      claim.companyId
    )

    return withCors(ApiResponse.success(updated, 'Claim marked as paid'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
