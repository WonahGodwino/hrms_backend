// src/app/api/leaves/policies/[id]/route.ts
//
// PATCH — update a single leave policy's settings from the Leave Settings UI.
// Today this is just the approval workflow (who signs off on leave under this
// policy): approval is configured here per policy rather than in the upload
// sheet. All leave requires approval, so the "no approval" option is gone —
// only who approves is configurable.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getAccessibleCompanyIds, UserContext } from '@/app/lib/access-control'

// Every leave needs approval; these are the possible approval chains.
const APPROVAL_WORKFLOWS = ['MANAGER_THEN_HR', 'MANAGER_ONLY', 'HR_ONLY'] as const

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = (await requireModuleAccess(token, 'LEAVE', ['HR', 'ADMIN', 'SUPER_ADMIN'])) as UserContext
    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const { approvalWorkflow } = body as { approvalWorkflow?: string }

    if (!approvalWorkflow || !APPROVAL_WORKFLOWS.includes(approvalWorkflow as (typeof APPROVAL_WORKFLOWS)[number])) {
      return withCors(
        ApiResponse.error(`approvalWorkflow must be one of: ${APPROVAL_WORKFLOWS.join(', ')}`, 400),
        origin
      )
    }

    const policy = await prisma.leavePolicy.findUnique({ where: { id }, select: { id: true, companyId: true } })
    if (!policy) {
      return withCors(ApiResponse.error('Leave policy not found', 404), origin)
    }

    // Company access: SUPER_ADMIN anywhere, otherwise the policy's company must
    // be one the user can manage (same rule the types listing uses).
    if (user.role !== 'SUPER_ADMIN') {
      const accessible = await getAccessibleCompanyIds(user)
      const allLinks = await prisma.userCompany.findMany({
        where: { userId: user.userId, role: 'ALL' },
        select: { companyId: true },
      })
      allLinks.forEach((l) => {
        if (!accessible.includes(l.companyId)) accessible.push(l.companyId)
      })
      if (!accessible.includes(policy.companyId)) {
        return withCors(ApiResponse.error('You do not have access to this leave policy', 403), origin)
      }
    }

    const updated = await prisma.leavePolicy.update({
      where: { id },
      data: { approvalWorkflow },
      select: { id: true, name: true, approvalWorkflow: true, requiresApproval: true },
    })

    return withCors(ApiResponse.success({ policy: updated }, 'Approval workflow updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
