// src/app/api/staff-loans-benefits/benefit-requests/route.ts
//
// POST — staff requests/enrolls in a catalog benefit (AvailableBenefits.jsx).
//        Snapshots the policy's requestApprovalWorkflow and enters the
//        approval chain immediately (no guarantor concept for benefits).
// GET   — list: self (own) for STAFF, org-wide for HR/Admin/Super Admin.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { matchesBenefitScope } from '@/app/lib/staff-loans-benefits/benefit-eligibility'
import { enterApprovalChain, resolveApproverStaffIds } from '@/app/lib/staff-loans-benefits/approval-engine'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const body = await request.json()
    const { benefitPolicyId, requestedAmount, expectedStartDate, reason } = body || {}
    if (!benefitPolicyId) return withCors(ApiResponse.error('benefitPolicyId is required', 400), origin)

    const [staff, policy] = await Promise.all([
      prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { id: true, companyId: true, firstName: true, lastName: true, designationId: true } }),
      prisma.benefitPolicy.findUnique({ where: { id: benefitPolicyId } }),
    ])
    if (!staff) return withCors(ApiResponse.error('Staff record not found', 404), origin)
    if (!policy || policy.companyId !== staff.companyId || policy.status !== 'PUBLISHED' || !policy.isActive) {
      return withCors(ApiResponse.error('Benefit policy not found or not available', 404), origin)
    }
    if (!matchesBenefitScope(policy, staff)) {
      return withCors(ApiResponse.error('You are not eligible for this benefit', 400), origin)
    }

    const existing = await prisma.benefitRequest.findFirst({
      where: { staffId: staff.id, benefitPolicyId, status: { in: ['PENDING_APPROVAL'] } },
    })
    if (existing) return withCors(ApiResponse.error('You already have a pending request for this benefit', 400), origin)

    const company = await prisma.company.findUnique({ where: { id: staff.companyId }, select: { baseCurrency: true } })
    const currencyCode = company?.baseCurrency || 'NGN'
    const workflow = policy.requestApprovalWorkflow as any

    const benefitRequest = await prisma.benefitRequest.create({
      data: {
        companyId: staff.companyId,
        staffId: staff.id,
        benefitPolicyId: policy.id,
        benefitPolicyVersion: policy.version,
        benefitName: policy.name,
        requestedAmount: requestedAmount ?? undefined,
        currencyCode,
        expectedStartDate: expectedStartDate ? new Date(expectedStartDate) : undefined,
        reason: reason ?? undefined,
        approvalWorkflow: workflow,
        createdBy: user.userId,
      },
    })

    const entry = await enterApprovalChain({
      companyId: staff.companyId,
      requestingStaffId: staff.id,
      requestType: 'BENEFIT_REQUEST',
      requestId: benefitRequest.id,
      workflow,
    })
    const updated = await prisma.benefitRequest.update({ where: { id: benefitRequest.id }, data: entry })

    const approverIds = await resolveApproverStaffIds({ ...entry, companyId: staff.companyId })
    await Promise.all(
      approverIds.map((id) =>
        createNotification(
          id,
          NOTIFICATION_TYPES.APPROVAL_ACTION_NEEDED,
          'A benefit request needs your approval',
          `${staff.firstName} ${staff.lastName} has requested ${policy.name}.`,
          { benefitRequestId: benefitRequest.id },
          staff.companyId
        )
      )
    )

    await logStaffActivity({
      staffRecordId: staff.id,
      companyId: staff.companyId,
      action: 'BENEFIT_REQUESTED',
      performedById: staff.id,
      performedByName: `${staff.firstName} ${staff.lastName}`,
      performedByRole: user.role,
      details: { benefitRequestId: benefitRequest.id, benefitName: policy.name },
    })

    return withCors(ApiResponse.success(updated, 'Benefit request submitted'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    const { searchParams } = new URL(request.url)
    const isManager = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user.role)
    const status = searchParams.get('status')

    const where: any = isManager ? { companyId: user.companyId } : { staffId: user.userId }
    if (status) where.status = status
    if (!user.companyId && isManager) return withCors(ApiResponse.success({ requests: [] }), origin)

    const requests = await prisma.benefitRequest.findMany({
      where,
      include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return withCors(ApiResponse.success({ requests }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
