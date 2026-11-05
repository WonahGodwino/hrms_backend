// src/app/api/auth/logout/route.ts
// Device Management — explicit logout. Without this, a device the user
// deliberately signed out of would still show "active" in Staff Management/
// Employee 360/Profile until the token naturally expires (up to 7 days).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { logStaffActivity } from '@/app/lib/device/device-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const decoded = requireAuth(token)

    if (decoded.deviceId) {
      const device = await prisma.device.findFirst({
        where: { id: decoded.deviceId, staffRecordId: decoded.userId },
      })

      if (device && device.isActive) {
        await prisma.device.update({
          where: { id: device.id },
          data: {
            isActive: false,
            revokedAt: new Date(),
            revokedById: decoded.userId,
            revokedByRole: decoded.role,
            revokedReason: 'LOGOUT',
          },
        })

        const staff = await prisma.staffRecord.findUnique({
          where: { id: decoded.userId },
          select: { companyId: true, firstName: true, lastName: true },
        })
        if (staff) {
          await logStaffActivity({
            staffRecordId: decoded.userId,
            companyId: staff.companyId,
            action: 'LOGOUT',
            performedById: decoded.userId,
            performedByName: `${staff.firstName} ${staff.lastName}`,
            performedByRole: decoded.role,
            details: { deviceId: device.id, deviceName: device.deviceName },
          })
        }
      }
    }

    return withCors(ApiResponse.success({ loggedOut: true }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
