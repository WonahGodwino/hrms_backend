// src/app/api/staff-loans-benefits/access-config/[pageKey]/route.ts
// PUT — upserts the department/designation allow-list for one governed page.
// Requires CORE_SETUP to be enabled for the company (Department/Designation
// are Core Setup concepts) — mirrors the DESIGNATION approver-kind's
// existing defense-in-depth convention in approval-engine.ts.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, hasModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { PAGE_KEYS, type PageKey } from '@/app/lib/staff-loans-benefits/page-access'
import { logStaffActivity } from '@/app/lib/device/device-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PUT(request: NextRequest, { params }: { params: { pageKey: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR'])

    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)
    if (!PAGE_KEYS.includes(params.pageKey as PageKey)) {
      return withCors(ApiResponse.error('Unknown pageKey', 400), origin)
    }
    const pageKey = params.pageKey as PageKey

    const coreSetupEnabled = await hasModuleAccess(user.companyId, 'CORE_SETUP')
    if (!coreSetupEnabled) {
      return withCors(ApiResponse.error('The Core Setup module must be enabled for this company before department/designation access can be configured', 400), origin)
    }

    const body = await request.json()
    const departmentIds = Array.isArray(body?.departmentIds) ? body.departmentIds.filter((v: unknown) => typeof v === 'string') : []
    const designationIds = Array.isArray(body?.designationIds) ? body.designationIds.filter((v: unknown) => typeof v === 'string') : []

    const config = await prisma.loansBenefitsPageAccess.upsert({
      where: { companyId_pageKey: { companyId: user.companyId, pageKey } },
      create: { companyId: user.companyId, pageKey, departmentIds, designationIds, updatedBy: user.userId },
      update: { departmentIds, designationIds, updatedBy: user.userId },
    })

    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    if (staff) {
      await logStaffActivity({
        staffRecordId: user.userId,
        companyId: user.companyId,
        action: 'LOANS_BENEFITS_ACCESS_CONFIG_UPDATED',
        performedById: user.userId,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: user.role,
        details: { pageKey, departmentIds, designationIds },
      })
    }

    return withCors(ApiResponse.success(config, 'Access configuration updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
