// src/app/api/staff-loans-benefits/policies/benefits/route.ts
//
// GET  — list a company's benefit policies (catalog). STAFF only sees active
//        PUBLISHED ones; HR/ADMIN/SUPER_ADMIN see everything for Policy
//        Setup. Optional `designationId`/`jobId` filters mirror the old
//        module's scoping-preview query params.
// POST — create a new benefit policy, starting as a DRAFT.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, hasModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateApprovalWorkflow } from '@/app/lib/staff-loans-benefits/types'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

async function assertDesignationStepsAllowed(companyId: string, workflow: { approverKind: string }[]) {
  const hasDesignationStep = workflow.some((s) => s.approverKind === 'DESIGNATION')
  if (!hasDesignationStep) return
  const enabled = await hasModuleAccess(companyId, 'CORE_SETUP')
  if (!enabled) {
    throw new Error(
      'This approval chain uses a Designation-based step, which requires the Core Setup module to be enabled for this company.'
    )
  }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    if (!user.companyId) return withCors(ApiResponse.success({ policies: [] }), origin)

    const { searchParams } = new URL(request.url)
    // Full-catalog access is governed purely by BENEFIT_POLICY_CONFIG page
    // access (SUPER_ADMIN always passes via canAccessPage) — role no longer
    // gates it. Anyone without access degrades to the same PUBLISHED-only
    // view a STAFF caller gets — this GET is also used by AvailableBenefits.jsx
    // and BenefitAllocation.jsx's policy picker, both of which only ever
    // need published policies anyway.
    const isManager = await canAccessPage('BENEFIT_POLICY_CONFIG', user)
    const where: any = { companyId: user.companyId }
    if (!isManager) {
      where.status = 'PUBLISHED'
      where.isActive = true
    }
    const designationId = searchParams.get('designationId')
    if (designationId) where.designationId = designationId
    const jobId = searchParams.get('jobId')
    if (jobId) where.jobId = jobId

    const policies = await prisma.benefitPolicy.findMany({ where, orderBy: { createdAt: 'desc' } })
    return withCors(ApiResponse.success({ policies }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    // STAFF included: BENEFIT_POLICY_CONFIG access is now decided purely by
    // the canAccessPage check below, not by platform role — see decision #1.
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)
    if (!(await canAccessPage('BENEFIT_POLICY_CONFIG', user))) {
      return withCors(ApiResponse.error('You do not have access to Benefit Policy Configuration', 403), origin)
    }

    const body = await request.json()
    if (!body?.name || typeof body.name !== 'string') {
      return withCors(ApiResponse.error('name is required', 400), origin)
    }
    if (!body?.category || typeof body.category !== 'string') {
      return withCors(ApiResponse.error('category is required', 400), origin)
    }

    let requestApprovalWorkflow
    let claimApprovalWorkflow
    try {
      requestApprovalWorkflow = validateApprovalWorkflow(body.requestApprovalWorkflow)
      await assertDesignationStepsAllowed(user.companyId, requestApprovalWorkflow)
      if (body.claimApprovalWorkflow) {
        claimApprovalWorkflow = validateApprovalWorkflow(body.claimApprovalWorkflow)
        await assertDesignationStepsAllowed(user.companyId, claimApprovalWorkflow)
      }
    } catch (e: any) {
      return withCors(ApiResponse.error(e.message || 'Invalid approval workflow', 400), origin)
    }

    const policy = await prisma.benefitPolicy.create({
      data: {
        companyId: user.companyId,
        name: body.name,
        category: body.category,
        benefitType: body.benefitType ?? 'FIXED_AMOUNT',
        description: body.description ?? undefined,
        monetaryValue: body.monetaryValue ?? undefined,
        keyValue: body.keyValue ?? undefined,
        status: 'DRAFT',
        version: 1,
        eligibilityRules: body.eligibilityRules ?? undefined,
        jobId: body.jobId ?? undefined,
        designationId: body.designationId ?? undefined,
        usageLimitAmount: body.usageLimitAmount ?? undefined,
        usageFrequency: body.usageFrequency ?? undefined,
        rollingValidityMonths: body.rollingValidityMonths ?? undefined,
        maxUsagePerEmployee: body.maxUsagePerEmployee ?? undefined,
        maxClaimAmount: body.maxClaimAmount ?? undefined,
        carryOverAllowed: body.carryOverAllowed ?? false,
        requiresClaimSubmission: body.requiresClaimSubmission ?? false,
        requiresClaimApproval: body.requiresClaimApproval ?? true,
        requestApprovalWorkflow,
        claimApprovalWorkflow: claimApprovalWorkflow ?? undefined,
        totalAllocatedBudget: body.totalAllocatedBudget ?? undefined,
        perEmployeeCap: body.perEmployeeCap ?? undefined,
        departmentalCaps: body.departmentalCaps ?? undefined,
        createdBy: user.userId,
      },
    })

    return withCors(ApiResponse.success(policy, 'Benefit policy created'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
