// src/app/api/staff-loans-benefits/benefit-claims/route.ts
//
// POST — submit a reimbursement claim against an active allocation
//        (ClaimsReimbursements.jsx). Enters the policy's claimApprovalWorkflow
//        if `requiresClaimApproval`, otherwise auto-approves.
// GET   — list: self (own) for STAFF, org-wide for HR/Admin/Super Admin.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
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
    const { benefitAllocationId, amount, expenseDate, description, attachmentUrls } = body || {}
    if (!benefitAllocationId) return withCors(ApiResponse.error('benefitAllocationId is required', 400), origin)
    if (!amount || amount <= 0) return withCors(ApiResponse.error('A positive amount is required', 400), origin)
    if (!expenseDate) return withCors(ApiResponse.error('expenseDate is required', 400), origin)

    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { id: true, companyId: true, firstName: true, lastName: true } })
    if (!staff) return withCors(ApiResponse.error('Staff record not found', 404), origin)

    const allocation = await prisma.benefitAllocation.findUnique({ where: { id: benefitAllocationId }, include: { policy: true } })
    if (!allocation || allocation.staffId !== staff.id) return withCors(ApiResponse.error('Benefit allocation not found', 404), origin)
    if (allocation.status !== 'ACTIVE') return withCors(ApiResponse.error('This benefit allocation is no longer active', 400), origin)

    const policy = allocation.policy
    if (policy.maxClaimAmount && amount > Number(policy.maxClaimAmount)) {
      return withCors(ApiResponse.error(`Claim amount exceeds the maximum of ${policy.maxClaimAmount} for this benefit`, 400), origin)
    }

    const requiresApproval = policy.requiresClaimApproval
    const workflow = (policy.claimApprovalWorkflow as any) || (policy.requestApprovalWorkflow as any)

    const claim = await prisma.benefitClaim.create({
      data: {
        companyId: staff.companyId,
        staffId: staff.id,
        benefitAllocationId: allocation.id,
        benefitPolicyId: policy.id,
        benefitPolicyVersion: policy.version,
        benefitName: policy.name,
        amount,
        currencyCode: allocation.currencyCode,
        expenseDate: new Date(expenseDate),
        description: description ?? undefined,
        attachmentUrls: attachmentUrls ?? undefined,
        status: requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED',
        approvalWorkflow: workflow,
        createdBy: user.userId,
      },
    })

    if (requiresApproval) {
      const entry = await enterApprovalChain({
        companyId: staff.companyId,
        requestingStaffId: staff.id,
        requestType: 'BENEFIT_CLAIM',
        requestId: claim.id,
        workflow,
      })
      const updated = await prisma.benefitClaim.update({ where: { id: claim.id }, data: entry })

      const approverIds = await resolveApproverStaffIds({ ...entry, companyId: staff.companyId })
      await Promise.all(
        approverIds.map((id) =>
          createNotification(
            id,
            NOTIFICATION_TYPES.APPROVAL_ACTION_NEEDED,
            'A claim needs your approval',
            `${staff.firstName} ${staff.lastName} submitted a claim of ${amount} against ${policy.name}.`,
            { benefitClaimId: claim.id },
            staff.companyId
          )
        )
      )

      await logStaffActivity({
        staffRecordId: staff.id,
        companyId: staff.companyId,
        action: 'BENEFIT_CLAIM_SUBMITTED',
        performedById: staff.id,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: user.role,
        details: { benefitClaimId: claim.id, amount },
      })

      return withCors(ApiResponse.success(updated, 'Claim submitted'), origin)
    }

    await logStaffActivity({
      staffRecordId: staff.id,
      companyId: staff.companyId,
      action: 'BENEFIT_CLAIM_SUBMITTED',
      performedById: staff.id,
      performedByName: `${staff.firstName} ${staff.lastName}`,
      performedByRole: user.role,
      details: { benefitClaimId: claim.id, amount, autoApproved: true },
    })

    return withCors(ApiResponse.success(claim, 'Claim submitted and auto-approved'), origin)
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
    if (!user.companyId && isManager) return withCors(ApiResponse.success({ claims: [] }), origin)

    const claims = await prisma.benefitClaim.findMany({
      where,
      include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return withCors(ApiResponse.success({ claims }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
