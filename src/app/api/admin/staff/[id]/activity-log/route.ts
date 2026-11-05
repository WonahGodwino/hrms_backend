// src/app/api/admin/staff/[id]/activity-log/route.ts
//
// Device Management — StaffActivityLog feed for one staff member (login,
// device, block/unblock events). Powers the small activity history shown
// on Employee 360's Devices tab. Same self-or-scoped visibility rule as
// /api/staff/[id]/devices.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const currentUser = requireAuth(token)

    const targetStaff = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, role: true },
    })
    if (!targetStaff) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    const isSelf = currentUser.userId === targetStaff.id

    if (!isSelf) {
      if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(currentUser.role)) {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
      const hasCompanyAccess = await checkStaffAccess(currentUser, targetStaff.companyId)
      if (!hasCompanyAccess) {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
      if (currentUser.role !== 'SUPER_ADMIN' && targetStaff.role !== 'STAFF') {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
    }

    const { searchParams } = new URL(request.url)
    // Cap raised to 300 so a device-heavy history (per-device trails in
    // Employee 360's Device History tab) isn't truncated at 100.
    const limit = Math.min(Number(searchParams.get('limit')) || 25, 300)

    const logs = await prisma.staffActivityLog.findMany({
      where: { staffRecordId: targetStaff.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return withCors(ApiResponse.success({ logs }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
