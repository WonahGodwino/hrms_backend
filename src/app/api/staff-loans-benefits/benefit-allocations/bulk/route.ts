// src/app/api/staff-loans-benefits/benefit-allocations/bulk/route.ts
// POST — allocate one benefit policy to multiple staff at once (the
// BenefitAllocation.jsx admin page's row-select -> bulk drawer).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { canAccessPage } from '@/app/lib/staff-loans-benefits/page-access'
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
    // STAFF included: BENEFIT_ALLOCATION access is now decided purely by
    // the canAccessPage check below, not by platform role — see decision #1.
    const user = await requireModuleAccess(token, 'STAFF_LOANS_BENEFITS', ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])
    if (!user.companyId) return withCors(ApiResponse.error('No company context', 400), origin)
    if (!(await canAccessPage('BENEFIT_ALLOCATION', user))) {
      return withCors(ApiResponse.error('You do not have access to Benefit Allocation', 403), origin)
    }

    const body = await request.json()
    const { staffIds, benefitPolicyId, allocationAmount, expiryDate, note } = body || {}
    if (!Array.isArray(staffIds) || staffIds.length === 0) return withCors(ApiResponse.error('staffIds must be a non-empty array', 400), origin)
    if (!benefitPolicyId) return withCors(ApiResponse.error('benefitPolicyId is required', 400), origin)

    const policy = await prisma.benefitPolicy.findUnique({ where: { id: benefitPolicyId } })
    if (!policy || policy.companyId !== user.companyId) return withCors(ApiResponse.error('Benefit policy not found', 404), origin)

    const [staff, company] = await Promise.all([
      prisma.staffRecord.findMany({ where: { id: { in: staffIds }, companyId: user.companyId }, select: { id: true } }),
      prisma.company.findUnique({ where: { id: user.companyId }, select: { baseCurrency: true } }),
    ])
    const currencyCode = company?.baseCurrency || 'NGN'

    const allocations = await prisma.benefitAllocation.createMany({
      data: staff.map((s) => ({
        companyId: user.companyId!,
        staffId: s.id,
        benefitPolicyId: policy.id,
        benefitPolicyVersion: policy.version,
        benefitName: policy.name,
        allocationAmount: allocationAmount ?? policy.monetaryValue ?? 0,
        currencyCode,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        allocatedBy: user.userId,
        note: note ?? undefined,
      })),
    })

    await Promise.all(
      staff.map((s) =>
        Promise.all([
          logStaffActivity({
            staffRecordId: s.id,
            companyId: user.companyId!,
            action: 'BENEFIT_ALLOCATED',
            performedById: user.userId,
            performedByName: user.email,
            performedByRole: user.role,
            details: { benefitName: policy.name, bulk: true },
          }),
          createNotification(
            s.id,
            NOTIFICATION_TYPES.BENEFIT_ALLOCATED,
            'A benefit has been allocated to you',
            `${policy.name} has been allocated to your account.`,
            {},
            user.companyId!
          ),
        ])
      )
    )

    return withCors(ApiResponse.success({ count: allocations.count }, `Allocated ${policy.name} to ${allocations.count} staff members`), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
