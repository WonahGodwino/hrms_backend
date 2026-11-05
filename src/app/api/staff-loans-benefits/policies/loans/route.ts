// src/app/api/staff-loans-benefits/policies/loans/route.ts
//
// GET  — list a company's loan policies. STAFF only sees active PUBLISHED
//        ones (what they can actually apply against); HR/ADMIN/SUPER_ADMIN
//        see everything (draft/published/archived) for Policy Setup.
// POST — create a new loan policy, starting as a DRAFT.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, hasModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validateApprovalWorkflow } from '@/app/lib/staff-loans-benefits/types'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'

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

    if (!user.companyId) return withCors(ApiResponse.success({ policies: [] }), origin)

    // Full-catalog access is governed purely by LOAN_POLICY_CONFIG page
    // access (SUPER_ADMIN always passes via canAccessPage) — role no longer
    // gates it. Anyone without access degrades to the same PUBLISHED-only
    // view a STAFF caller gets (e.g. ApplyForLoan.jsx), never leaking
    // drafts/archived policies, never 403ing.
    const isManager = await canAccessPage('LOAN_POLICY_CONFIG', user)
    const where: any = { companyId: user.companyId }
    if (!isManager) {
      where.status = 'PUBLISHED'
      where.isActive = true
    }

    const policies = await prisma.loanPolicy.findMany({ where, orderBy: { createdAt: 'desc' } })
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
    // STAFF included: LOAN_POLICY_CONFIG access is now decided purely by
    // the canAccessPage check below, not by platform role — see decision #1.
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)
    if (!(await canAccessPage('LOAN_POLICY_CONFIG', user))) {
      return withCors(ApiResponse.error('You do not have access to Loan Policy Configuration', 403), origin)
    }

    const body = await request.json()
    if (!body?.name || typeof body.name !== 'string') {
      return withCors(ApiResponse.error('name is required', 400), origin)
    }

    let approvalWorkflow
    try {
      approvalWorkflow = validateApprovalWorkflow(body.approvalWorkflow)
      await assertDesignationStepsAllowed(user.companyId, approvalWorkflow)
    } catch (e: any) {
      return withCors(ApiResponse.error(e.message || 'Invalid approval workflow', 400), origin)
    }

    const policy = await prisma.loanPolicy.create({
      data: {
        companyId: user.companyId,
        name: body.name,
        status: 'DRAFT',
        version: 1,
        minServiceMonths: body.minServiceMonths ?? 3,
        maxDebtRatioPercent: body.maxDebtRatioPercent ?? 40,
        eligibilityRules: body.eligibilityRules ?? undefined,
        maxAmount: body.maxAmount ?? 500000,
        salaryMultiplier: body.salaryMultiplier ?? 1.0,
        maxDurationMonths: body.maxDurationMonths ?? 12,
        interestRatePercent: body.interestRatePercent ?? 5,
        interestByDuration: body.interestByDuration ?? undefined,
        processingFeePercent: body.processingFeePercent ?? 0,
        autoDeductionEnabled: body.autoDeductionEnabled ?? true,
        gracePeriodDays: body.gracePeriodDays ?? 0,
        requiresGuarantor: body.requiresGuarantor ?? false,
        guarantorThresholdAmount: body.guarantorThresholdAmount ?? undefined,
        guarantorMustBeActiveInCompany: body.guarantorMustBeActiveInCompany ?? true,
        guarantorMustNotHaveActiveLoan: body.guarantorMustNotHaveActiveLoan ?? true,
        maxGuarantorExposure: body.maxGuarantorExposure ?? undefined,
        maxActiveLoansPerStaff: body.maxActiveLoansPerStaff ?? 1,
        approvalWorkflow,
        createdBy: user.userId,
      },
    })

    return withCors(ApiResponse.success(policy, 'Loan policy created'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
