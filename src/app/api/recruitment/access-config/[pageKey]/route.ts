// src/app/api/recruitment/access-config/[pageKey]/route.ts
// GET    — fetch the current allow-list for one pageKey (null if unconfigured).
// PUT    — upserts the department/designation allow-list for one pageKey.
// DELETE — removes the row entirely, reverting the page to unrestricted
//          (opt-in scoping: deleting the row un-scopes the page, it does not
//          lock it down — the opposite of the Loans & Benefits precedent).
// Requires CORE_SETUP to be enabled for the company (Department/Designation
// are Core Setup concepts) — mirrors the Staff Loans & Benefits convention.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, hasModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logStaffActivity } from '@/app/lib/device/device-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { pageKey: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['SUPER_ADMIN', 'ADMIN', 'HR'])

    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)

    const config = await prisma.recruitmentPageAccess.findUnique({
      where: { companyId_pageKey: { companyId: user.companyId, pageKey: params.pageKey } },
    })

    if (!config) {
      return withCors(ApiResponse.success({ pageKey: params.pageKey, departmentIds: [], designationIds: [], configured: false }), origin)
    }

    return withCors(
      ApiResponse.success({
        pageKey: config.pageKey,
        departmentIds: (config.departmentIds as string[]) || [],
        designationIds: (config.designationIds as string[]) || [],
        configured: true,
        updatedAt: config.updatedAt,
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PUT(request: NextRequest, { params }: { params: { pageKey: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['SUPER_ADMIN', 'ADMIN', 'HR'])

    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)
    const pageKey = params.pageKey

    const coreSetupEnabled = await hasModuleAccess(user.companyId, 'CORE_SETUP')
    if (!coreSetupEnabled) {
      return withCors(ApiResponse.error('The Core Setup module must be enabled for this company before department/designation access can be configured', 400), origin)
    }

    const body = await request.json()
    const departmentIds = Array.isArray(body?.departmentIds) ? body.departmentIds.filter((v: unknown) => typeof v === 'string') : []
    const designationIds = Array.isArray(body?.designationIds) ? body.designationIds.filter((v: unknown) => typeof v === 'string') : []

    const config = await prisma.recruitmentPageAccess.upsert({
      where: { companyId_pageKey: { companyId: user.companyId, pageKey } },
      create: { companyId: user.companyId, pageKey, departmentIds, designationIds, updatedBy: user.userId },
      update: { departmentIds, designationIds, updatedBy: user.userId },
    })

    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    if (staff) {
      await logStaffActivity({
        staffRecordId: user.userId,
        companyId: user.companyId,
        action: 'RECRUITMENT_ACCESS_CONFIG_UPDATED',
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

export async function DELETE(request: NextRequest, { params }: { params: { pageKey: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['SUPER_ADMIN', 'ADMIN', 'HR'])

    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)
    const pageKey = params.pageKey

    const existing = await prisma.recruitmentPageAccess.findUnique({
      where: { companyId_pageKey: { companyId: user.companyId, pageKey } },
    })
    if (!existing) return withCors(ApiResponse.error('No access configuration found for this pageKey', 404), origin)

    await prisma.recruitmentPageAccess.delete({
      where: { companyId_pageKey: { companyId: user.companyId, pageKey } },
    })

    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { firstName: true, lastName: true } })
    if (staff) {
      await logStaffActivity({
        staffRecordId: user.userId,
        companyId: user.companyId,
        action: 'RECRUITMENT_ACCESS_CONFIG_UPDATED',
        performedById: user.userId,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: user.role,
        details: { pageKey, deleted: true },
      })
    }

    return withCors(ApiResponse.success({ pageKey }, 'Access configuration removed — page is unrestricted again'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
