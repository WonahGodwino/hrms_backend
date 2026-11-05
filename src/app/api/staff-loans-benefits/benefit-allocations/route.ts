// src/app/api/staff-loans-benefits/benefit-allocations/route.ts
//
// GET  — self (own active allocations, BenefitsDashboard.jsx) or org-wide
//        for HR/Admin/Super Admin (BenefitAllocation.jsx admin table).
// POST — HR/Admin directly allocates a benefit to a staff member, bypassing
//        the request/approval flow (single allocation — see bulk/route.ts
//        for the multi-select variant).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'

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

    const { searchParams } = new URL(request.url)
    const isManager = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(user.role)
    const status = searchParams.get('status')

    const where: any = isManager ? { companyId: user.companyId } : { staffId: user.userId }
    if (status) where.status = status
    if (!user.companyId && isManager) return withCors(ApiResponse.success({ allocations: [] }), origin)

    const allocations = await prisma.benefitAllocation.findMany({
      where,
      include: { staff: { select: { id: true, firstName: true, lastName: true, department: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    return withCors(ApiResponse.success({ allocations }), origin)
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
    // STAFF included: BENEFIT_ALLOCATION access is now decided purely by
    // the canAccessPage check below, not by platform role — see decision #1.
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    if (!(await canAccessPage('BENEFIT_ALLOCATION', user))) {
      return withCors(ApiResponse.error('You do not have access to Benefit Allocation', 403), origin)
    }

    const body = await request.json()
    const { staffId, benefitPolicyId, allocationAmount, expiryDate, note } = body || {}
    if (!staffId || !benefitPolicyId) return withCors(ApiResponse.error('staffId and benefitPolicyId are required', 400), origin)

    const staff = await prisma.staffRecord.findUnique({ where: { id: staffId }, select: { id: true, companyId: true } })
    if (!staff) return withCors(ApiResponse.error('Staff record not found', 404), origin)
    // checkStaffAccess alone only recognizes HR/ADMIN/SUPER_ADMIN via their
    // UserCompany grants — STAFF never gets one (see auth/register/route.ts),
    // so a same-company fast path is needed for a page-access-granted STAFF
    // actor to reach their own company's records.
    const hasAccess = user.companyId === staff.companyId || (await checkStaffAccess(user, staff.companyId))
    if (!hasAccess) return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)

    const policy = await prisma.benefitPolicy.findUnique({ where: { id: benefitPolicyId } })
    if (!policy || policy.companyId !== staff.companyId) return withCors(ApiResponse.error('Benefit policy not found', 404), origin)

    const company = await prisma.company.findUnique({ where: { id: staff.companyId }, select: { baseCurrency: true } })

    const allocation = await prisma.benefitAllocation.create({
      data: {
        companyId: staff.companyId,
        staffId: staff.id,
        benefitPolicyId: policy.id,
        benefitPolicyVersion: policy.version,
        benefitName: policy.name,
        allocationAmount: allocationAmount ?? policy.monetaryValue ?? 0,
        currencyCode: company?.baseCurrency || 'NGN',
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        allocatedBy: user.userId,
        note: note ?? undefined,
      },
    })

    await logStaffActivity({
      staffRecordId: staff.id,
      companyId: staff.companyId,
      action: 'BENEFIT_ALLOCATED',
      performedById: user.userId,
      performedByName: user.email,
      performedByRole: user.role,
      details: { allocationId: allocation.id, benefitName: policy.name },
    })

    await createNotification(
      staff.id,
      NOTIFICATION_TYPES.BENEFIT_ALLOCATED,
      'A benefit has been allocated to you',
      `${policy.name} has been allocated to your account.`,
      { allocationId: allocation.id },
      staff.companyId
    )

    return withCors(ApiResponse.success(allocation, 'Benefit allocated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
