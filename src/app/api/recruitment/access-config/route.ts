// src/app/api/recruitment/access-config/route.ts
// GET  — list every Recruitment page that has been explicitly scoped (a
//        RecruitmentPageAccess row) for the caller's company, for the
//        Access Configuration screen. Unlike Staff Loans & Benefits, pages
//        with no row are simply absent here (opt-in scoping) — there is no
//        fixed, known universe of Recruitment pageKeys to merge against.
// POST — create a new scoped row for a pageKey that isn't configured yet.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess, hasModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logStaffActivity } from '@/app/lib/device/device-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['SUPER_ADMIN', 'ADMIN', 'HR'])

    if (!user.companyId) return withCors(ApiResponse.success({ pages: [] }), origin)

    const rows = await prisma.recruitmentPageAccess.findMany({ where: { companyId: user.companyId }, orderBy: { pageKey: 'asc' } })

    const pages = rows.map((row) => ({
      pageKey: row.pageKey,
      departmentIds: (row.departmentIds as string[]) || [],
      designationIds: (row.designationIds as string[]) || [],
      configured: true,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    return withCors(ApiResponse.success({ pages }), origin)
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
    const user = await requireModuleAccess(token, 'RECRUITMENT', ['SUPER_ADMIN', 'ADMIN', 'HR'])

    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)

    const coreSetupEnabled = await hasModuleAccess(user.companyId, 'CORE_SETUP')
    if (!coreSetupEnabled) {
      return withCors(ApiResponse.error('The Core Setup module must be enabled for this company before department/designation access can be configured', 400), origin)
    }

    const body = await request.json()
    const pageKey = typeof body?.pageKey === 'string' ? body.pageKey.trim() : ''
    if (!pageKey) return withCors(ApiResponse.error('pageKey is required', 400), origin)

    const existing = await prisma.recruitmentPageAccess.findUnique({
      where: { companyId_pageKey: { companyId: user.companyId, pageKey } },
    })
    if (existing) return withCors(ApiResponse.error('This page already has an access configuration — use PUT to update it', 409), origin)

    const departmentIds = Array.isArray(body?.departmentIds) ? body.departmentIds.filter((v: unknown) => typeof v === 'string') : []
    const designationIds = Array.isArray(body?.designationIds) ? body.designationIds.filter((v: unknown) => typeof v === 'string') : []

    const config = await prisma.recruitmentPageAccess.create({
      data: { companyId: user.companyId, pageKey, departmentIds, designationIds, updatedBy: user.userId },
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
        details: { pageKey, departmentIds, designationIds, created: true },
      })
    }

    return withCors(ApiResponse.success(config, 'Access configuration created', 201), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
