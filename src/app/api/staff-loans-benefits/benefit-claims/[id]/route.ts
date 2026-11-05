// src/app/api/staff-loans-benefits/benefit-claims/[id]/route.ts
// GET — claim detail with its approval history (3-step timeline in the UI).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const claim = await prisma.benefitClaim.findUnique({
      where: { id: params.id },
      include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } }, allocation: true },
    })
    if (!claim) return withCors(ApiResponse.error('Claim not found', 404), origin)

    if (claim.staffId !== user.userId) {
      if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user.role)) return withCors(ApiResponse.error('You do not have access to this claim', 403), origin)
      const hasAccess = await checkStaffAccess(user, claim.companyId)
      if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this claim', 403), origin)
    }

    const approvalHistory = await prisma.approvalActionLog.findMany({
      where: { requestType: 'BENEFIT_CLAIM', requestId: claim.id },
      orderBy: { createdAt: 'asc' },
    })

    return withCors(ApiResponse.success({ ...claim, approvalHistory }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
