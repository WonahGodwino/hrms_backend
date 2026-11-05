// src/app/api/staff-loans-benefits/policies/loans/[id]/archive/route.ts
// Soft-archive only — never hard-delete a policy with historical requests.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    // STAFF included: LOAN_POLICY_CONFIG access is now decided purely by
    // the canAccessPage check below, not by platform role — see decision #1.
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    if (!(await canAccessPage('LOAN_POLICY_CONFIG', user))) {
      return withCors(ApiResponse.error('You do not have access to Loan Policy Configuration', 403), origin)
    }

    const existing = await prisma.loanPolicy.findUnique({ where: { id: params.id } })
    if (!existing || (user.role !== 'SUPER_ADMIN' && existing.companyId !== user.companyId)) {
      return withCors(ApiResponse.error('Loan policy not found', 404), origin)
    }

    const updated = await prisma.loanPolicy.update({
      where: { id: params.id },
      data: { status: 'ARCHIVED', isActive: false, updatedBy: user.userId },
    })
    return withCors(ApiResponse.success(updated, 'Loan policy archived'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
