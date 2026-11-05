// src/app/api/staff-loans-benefits/policies/loans/[id]/route.ts
// PATCH — edit a loan policy (any status). Every edit bumps `version` so
// requests that already snapshotted an earlier version stay historically
// accurate without needing a separate "publish" bump.
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

const EDITABLE_FIELDS = [
  'name',
  'minServiceMonths',
  'maxDebtRatioPercent',
  'eligibilityRules',
  'maxAmount',
  'salaryMultiplier',
  'maxDurationMonths',
  'interestRatePercent',
  'interestByDuration',
  'processingFeePercent',
  'autoDeductionEnabled',
  'gracePeriodDays',
  'requiresGuarantor',
  'guarantorThresholdAmount',
  'guarantorMustBeActiveInCompany',
  'guarantorMustNotHaveActiveLoan',
  'maxGuarantorExposure',
  'maxActiveLoansPerStaff',
  'isActive',
]

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

    const body = await request.json()
    const data: any = { version: existing.version + 1, updatedBy: user.userId }
    for (const field of EDITABLE_FIELDS) {
      if (field in body) data[field] = body[field]
    }

    if (body.approvalWorkflow) {
      try {
        data.approvalWorkflow = validateApprovalWorkflow(body.approvalWorkflow)
        const hasDesignationStep = data.approvalWorkflow.some((s: any) => s.approverKind === 'DESIGNATION')
        if (hasDesignationStep) {
          const enabled = await hasModuleAccess(existing.companyId, 'CORE_SETUP')
          if (!enabled) {
            return withCors(
              ApiResponse.error(
                'This approval chain uses a Designation-based step, which requires the Core Setup module to be enabled for this company.',
                400
              ),
              origin
            )
          }
        }
      } catch (e: any) {
        return withCors(ApiResponse.error(e.message || 'Invalid approval workflow', 400), origin)
      }
    }

    const updated = await prisma.loanPolicy.update({ where: { id: params.id }, data })
    return withCors(ApiResponse.success(updated, 'Loan policy updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
