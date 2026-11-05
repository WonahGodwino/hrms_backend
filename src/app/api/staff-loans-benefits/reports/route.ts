// src/app/api/staff-loans-benefits/reports/route.ts
// GET ?type=loans|benefits — org-wide portfolio summary for HR/Admin/Super Admin.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyIds } from '@/app/lib/staff-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'loans'
    const companyIds = await resolveScopedCompanyIds(user)
    if (companyIds.length === 0) return withCors(ApiResponse.success({ type }), origin)

    if (type === 'benefits') {
      const [allocations, requests, policies] = await Promise.all([
        prisma.benefitAllocation.findMany({ where: { companyId: { in: companyIds } } }),
        prisma.benefitRequest.findMany({ where: { companyId: { in: companyIds } } }),
        prisma.benefitPolicy.findMany({ where: { companyId: { in: companyIds }, isActive: true } }),
      ])
      return withCors(
        ApiResponse.success({
          type: 'benefits',
          summary: {
            totalAllocated: allocations.reduce((s, a) => s + Number(a.allocationAmount), 0),
            activeAllocations: allocations.filter((a) => a.status === 'ACTIVE').length,
            totalRequests: requests.length,
            pendingRequests: requests.filter((r) => r.status === 'PENDING_APPROVAL').length,
            approvedRequests: requests.filter((r) => r.status === 'APPROVED').length,
            rejectedRequests: requests.filter((r) => r.status === 'REJECTED').length,
            activePolicies: policies.length,
          },
        }),
        origin
      )
    }

    const loans = await prisma.loanRequest.findMany({ where: { companyId: { in: companyIds } } })
    const disbursed = loans.filter((l) => l.status === 'DISBURSED' || l.status === 'REPAID')
    const totalIssued = disbursed.reduce((s, l) => s + Number(l.approvedAmount ?? l.requestedAmount), 0)
    const totalOutstanding = loans.filter((l) => l.status === 'DISBURSED').reduce((s, l) => s + Number(l.remainingBalance ?? 0), 0)
    const totalRepaid = totalIssued - totalOutstanding

    return withCors(
      ApiResponse.success({
        type: 'loans',
        summary: {
          totalIssued,
          totalOutstanding,
          recoveryRate: totalIssued > 0 ? Math.round((totalRepaid / totalIssued) * 1000) / 10 : 0,
          activeCount: loans.filter((l) => l.status === 'DISBURSED').length,
          pendingCount: loans.filter((l) => l.status === 'PENDING_GUARANTOR' || l.status === 'PENDING_APPROVAL').length,
          defaultedCount: loans.filter((l) => l.status === 'DEFAULTED').length,
          totalApplications: loans.length,
        },
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
