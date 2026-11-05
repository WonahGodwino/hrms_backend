// src/app/api/staff/[id]/devices/route.ts
//
// Device Management — list a staff member's up-to-3 registered devices,
// plus `history`: devices that were evicted (archived) to make room for a
// 4th device, kept so the account shows every device it has ever used.
// Serves both the Staff Management drawer's one-line summary and Employee
// 360's full device detail; the frontend just picks the most-recently-active
// row for the summary view.
//
// Visibility: self (any role) may always see their own devices. HR/ADMIN may
// see STAFF-role devices in their own company only — they cannot see each
// other's sessions. SUPER_ADMIN sees everyone (STAFF/HR/ADMIN), any company.
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
      // HR/ADMIN may only see STAFF-role sessions, not each other's.
      if (currentUser.role !== 'SUPER_ADMIN' && targetStaff.role !== 'STAFF') {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
    }

    // Live slots — non-archived rows only. Existing consumers are unchanged.
    const devices = await prisma.device.findMany({
      where: { staffRecordId: targetStaff.id, archivedAt: null },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        ipAddress: true,
        isActive: true,
        lastActiveAt: true,
        createdAt: true,
        revokedAt: true,
        revokedReason: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    })

    // Past devices — evicted/archived rows, most recently removed first.
    // Bounded so a churning account can't grow the payload without limit.
    const history = await prisma.device.findMany({
      where: { staffRecordId: targetStaff.id, archivedAt: { not: null } },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        ipAddress: true,
        createdAt: true,
        lastActiveAt: true,
        archivedAt: true,
        revokedReason: true,
      },
      orderBy: { archivedAt: 'desc' },
      take: 100,
    })

    return withCors(
      ApiResponse.success({
        devices,
        history,
        currentDeviceId: isSelf ? currentUser.deviceId ?? null : null,
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
