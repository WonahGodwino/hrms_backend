// src/app/api/staff-loans-benefits/policies/benefits/[id]/route.ts
// PATCH — edit a benefit policy (any status). Every edit bumps `version`.
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
  'category',
  'benefitType',
  'description',
  'monetaryValue',
  'keyValue',
  'eligibilityRules',
  'jobId',
  'designationId',
  'usageLimitAmount',
  'usageFrequency',
  'rollingValidityMonths',
  'maxUsagePerEmployee',
  'maxClaimAmount',
  'carryOverAllowed',
  'requiresClaimSubmission',
  'requiresClaimApproval',
  'totalAllocatedBudget',
  'perEmployeeCap',
  'departmentalCaps',
  'isActive',
]

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    // STAFF included: BENEFIT_POLICY_CONFIG access is now decided purely by
    // the canAccessPage check below, not by platform role — see decision #1.
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    if (!(await canAccessPage('BENEFIT_POLICY_CONFIG', user))) {
      return withCors(ApiResponse.error('You do not have access to Benefit Policy Configuration', 403), origin)
    }

    const existing = await prisma.benefitPolicy.findUnique({ where: { id: params.id } })
    if (!existing || (user.role !== 'SUPER_ADMIN' && existing.companyId !== user.companyId)) {
      return withCors(ApiResponse.error('Benefit policy not found', 404), origin)
    }

    const body = await request.json()
    const data: any = { version: existing.version + 1, updatedBy: user.userId }
    for (const field of EDITABLE_FIELDS) {
      if (field in body) data[field] = body[field]
    }

    for (const [key, target] of [
      ['requestApprovalWorkflow', 'requestApprovalWorkflow'],
      ['claimApprovalWorkflow', 'claimApprovalWorkflow'],
    ] as const) {
      if (body[key]) {
        try {
          const workflow = validateApprovalWorkflow(body[key])
          const hasDesignationStep = workflow.some((s: any) => s.approverKind === 'DESIGNATION')
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
          data[target] = workflow
        } catch (e: any) {
          return withCors(ApiResponse.error(e.message || 'Invalid approval workflow', 400), origin)
        }
      }
    }

    const updated = await prisma.benefitPolicy.update({ where: { id: params.id }, data })
    return withCors(ApiResponse.success(updated, 'Benefit policy updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
