// src/app/api/staff-loans-benefits/approvals/route.ts
// GET — unified, actor-filtered approval queue across loan requests,
// benefit requests, and benefit claims (ApprovalsDashboard.jsx). Not
// role-gated to HR/Admin only — a Line-Manager or Designation-resolved
// STAFF approver needs to reach this too; each returns an empty list if the
// actor has no pending items.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { resolveScopedCompanyIds } from '@/app/lib/staff-access'
import { buildApproverFilter } from '@/app/lib/staff-loans-benefits/approval-engine'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const companyIds = await resolveScopedCompanyIds(user)
    if (companyIds.length === 0) return withCors(ApiResponse.success({ items: [] }), origin)

    const approverFilter = await buildApproverFilter(user)
    const baseWhere = { companyId: { in: companyIds }, ...approverFilter }

    const [loans, benefitRequests, claims] = await Promise.all([
      prisma.loanRequest.findMany({
        where: { ...baseWhere, status: 'PENDING_APPROVAL' },
        include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.benefitRequest.findMany({
        where: { ...baseWhere, status: 'PENDING_APPROVAL' },
        include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.benefitClaim.findMany({
        where: { ...baseWhere, status: 'PENDING_APPROVAL' },
        include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const items = [
      ...loans.map((l) => ({
        id: l.id,
        requestType: 'LOAN_REQUEST' as const,
        staff: l.staff,
        label: l.loanType,
        amount: Number(l.requestedAmount),
        currencyCode: l.currencyCode,
        currentStepOrder: l.currentStepOrder,
        createdAt: l.createdAt,
      })),
      ...benefitRequests.map((r) => ({
        id: r.id,
        requestType: 'BENEFIT_REQUEST' as const,
        staff: r.staff,
        label: r.benefitName,
        amount: r.requestedAmount ? Number(r.requestedAmount) : null,
        currencyCode: r.currencyCode,
        currentStepOrder: r.currentStepOrder,
        createdAt: r.createdAt,
      })),
      ...claims.map((c) => ({
        id: c.id,
        requestType: 'BENEFIT_CLAIM' as const,
        staff: c.staff,
        label: c.benefitName,
        amount: Number(c.amount),
        currencyCode: c.currencyCode,
        currentStepOrder: c.currentStepOrder,
        createdAt: c.createdAt,
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    return withCors(ApiResponse.success({ items }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
