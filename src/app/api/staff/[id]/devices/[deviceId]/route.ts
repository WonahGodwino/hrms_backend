// src/app/api/staff/[id]/devices/[deviceId]/route.ts
//
// Device Management — "Clear session". Deactivates a device but keeps the
// row (re-logging in from that same browser later reactivates it rather
// than consuming a new slot) — distinct from the hard-delete used by the
// 4th-device eviction flow in /api/auth/login.
//
// Self-lockout is enforced here, backend-side, not just hidden in the UI:
// you can never clear the device that is rendering the request you're
// making right now — whether you're clearing your own session from the
// Profile page, or an HR/ADMIN/SUPER_ADMIN viewing their own record in the
// Staff Management drawer/360.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'
import { logStaffActivity } from '@/app/lib/device/device-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; deviceId: string } }
) {
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
      select: { id: true, companyId: true, role: true, firstName: true, lastName: true },
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

    const device = await prisma.device.findFirst({
      where: { id: params.deviceId, staffRecordId: targetStaff.id },
    })
    if (!device) {
      return withCors(ApiResponse.error('Device not found', 404), origin)
    }

    // Self-lockout guard — applies whenever the device being cleared is the
    // one the current request is authenticated with, regardless of whose
    // record is being viewed.
    if (currentUser.deviceId && device.id === currentUser.deviceId) {
      return withCors(ApiResponse.error("You can't clear the device you're currently using.", 409), origin)
    }

    if (!device.isActive) {
      return withCors(ApiResponse.error('This device session is already inactive.', 400), origin)
    }

    await prisma.device.update({
      where: { id: device.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedById: currentUser.userId,
        revokedByRole: currentUser.role,
        revokedReason: isSelf ? 'SELF_CLEARED' : 'ADMIN_CLEARED',
      },
    })

    await logStaffActivity({
      staffRecordId: targetStaff.id,
      companyId: targetStaff.companyId,
      action: 'DEVICE_CLEARED',
      performedById: currentUser.userId,
      performedByName: isSelf
        ? `${targetStaff.firstName} ${targetStaff.lastName}`
        : currentUser.email,
      performedByRole: currentUser.role,
      details: { deviceId: device.id, deviceName: device.deviceName, selfService: isSelf },
    })

    return withCors(ApiResponse.success({ cleared: true }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
