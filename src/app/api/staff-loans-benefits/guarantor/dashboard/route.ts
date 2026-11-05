// src/app/api/staff-loans-benefits/guarantor/dashboard/route.ts
// GET — the in-app Guarantor Dashboard: pending consent requests and active
// guarantees for the signed-in staff member (a convenience view onto the
// same state the email/token flow writes to).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, ALL_ROLES } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ALL_ROLES)

    const [pendingRequests, activeGuarantees] = await Promise.all([
      prisma.loanRequest.findMany({
        where: { guarantorStaffId: user.userId, guarantorStatus: 'PENDING' },
        include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.loanRequest.findMany({
        where: { guarantorStaffId: user.userId, guarantorStatus: 'ACCEPTED', status: { in: ['DISBURSED', 'APPROVED', 'PENDING_APPROVAL'] } },
        include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return withCors(ApiResponse.success({ pendingRequests, activeGuarantees }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
