// Post-authentication session issuance shared by password login and SSO.
//
// Encapsulates the Device Management (3-device cap, eviction) and the
// company/module/PHED/elevation resolution + JWT signing that /auth/login
// performs after a credential check. SSO uses this so its security posture
// (device cap, blocked/registered gates handled by the caller, role elevation)
// stays identical to password login.
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { signToken } from '@/app/lib/auth'
import { getEnabledModules, getArchivedModuleKeys } from '@/app/lib/module-access'
import { getActiveElevatedRole } from '@/app/lib/role-elevation'
import { getClientIp, logStaffActivity, parseUserAgent, type StaffActivityAction } from '@/app/lib/device/device-utils'

const MAX_DEVICES = 3

export type IssueSessionResult =
  | {
      ok: true
      token: string
      user: Record<string, unknown>
      company: Record<string, unknown> | null
      enabledModules: string[]
      archivedModules: string[]
    }
  | {
      ok: false
      status: number
      message: string
      code?: string
      devices?: any[]
    }

/**
 * Resolve the device (respecting the 3-device cap), fetch company context and
 * sign the session JWT for an already-authenticated staff record.
 *
 * @param staff  the staff record (should include `designation` for the payload)
 * @param request the incoming NextRequest (device key / IP / user-agent source)
 * @param opts.activityAction activity-log action to write (e.g. 'LOGIN_SUCCESS' | 'SSO_LOGIN_SUCCESS')
 */
export async function issueSession(
  staff: any,
  request: NextRequest,
  opts: { dropDeviceId?: string | null; activityAction?: StaffActivityAction } = {},
): Promise<IssueSessionResult> {
  const activityAction = opts.activityAction || 'LOGIN_SUCCESS'
  const dropDeviceId = opts.dropDeviceId || null

  // ---- Device Management: capture/cap/evict ----
  const deviceKey = request.headers.get('x-device-id') || randomUUID()
  const ipAddress = getClientIp(request)
  const userAgent = request.headers.get('user-agent')
  const { deviceName, deviceType } = parseUserAgent(userAgent)

  let device = await prisma.device.findUnique({
    where: { staffRecordId_deviceKey: { staffRecordId: staff.id, deviceKey } },
  })

  if (device && !device.archivedAt) {
    device = await prisma.device.update({
      where: { id: device.id },
      data: {
        isActive: true,
        lastActiveAt: new Date(),
        ipAddress,
        deviceName,
        deviceType,
        userAgent,
        revokedAt: null,
        revokedById: null,
        revokedByRole: null,
        revokedReason: null,
      },
    })
  } else {
    const deviceCount = await prisma.device.count({
      where: { staffRecordId: staff.id, archivedAt: null },
    })

    if (deviceCount < MAX_DEVICES) {
      const isReturningEvicted = Boolean(device)
      if (device) {
        device = await prisma.device.update({
          where: { id: device.id },
          data: {
            isActive: true,
            lastActiveAt: new Date(),
            ipAddress,
            deviceName,
            deviceType,
            userAgent,
            archivedAt: null,
            revokedAt: null,
            revokedById: null,
            revokedByRole: null,
            revokedReason: null,
          },
        })
      } else {
        device = await prisma.device.create({
          data: { staffRecordId: staff.id, deviceKey, deviceName, deviceType, ipAddress, userAgent },
        })
      }
      await logStaffActivity({
        staffRecordId: staff.id,
        companyId: staff.companyId,
        action: 'DEVICE_REGISTERED',
        performedById: staff.id,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: staff.role,
        details: {
          deviceId: device.id,
          deviceName,
          deviceType,
          ipAddress,
          ...(isReturningEvicted && { reactivated: true }),
        },
      })
    } else if (!dropDeviceId) {
      const existingDevices = await prisma.device.findMany({
        where: { staffRecordId: staff.id, archivedAt: null },
        select: { id: true, deviceName: true, deviceType: true, ipAddress: true, lastActiveAt: true, isActive: true },
        orderBy: { lastActiveAt: 'desc' },
      })
      return {
        ok: false,
        status: 409,
        message: 'Device limit reached. Choose a device to remove before signing in on this new device.',
        code: 'DEVICE_LIMIT_REACHED',
        devices: existingDevices,
      }
    } else {
      const droppedDevice = await prisma.device.findFirst({
        where: { id: dropDeviceId, staffRecordId: staff.id, archivedAt: null },
      })
      if (!droppedDevice) {
        return { ok: false, status: 400, message: 'Selected device not found' }
      }

      await prisma.device.update({
        where: { id: droppedDevice.id },
        data: {
          archivedAt: new Date(),
          isActive: false,
          revokedAt: new Date(),
          revokedById: staff.id,
          revokedByRole: staff.role,
          revokedReason: 'EVICTED',
        },
      })
      await logStaffActivity({
        staffRecordId: staff.id,
        companyId: staff.companyId,
        action: 'DEVICE_EVICTED',
        performedById: staff.id,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: staff.role,
        details: { deviceId: droppedDevice.id, deviceName: droppedDevice.deviceName, deviceType: droppedDevice.deviceType, ipAddress: droppedDevice.ipAddress, archived: true },
      })

      if (device) {
        device = await prisma.device.update({
          where: { id: device.id },
          data: {
            isActive: true,
            lastActiveAt: new Date(),
            ipAddress,
            deviceName,
            deviceType,
            userAgent,
            archivedAt: null,
            revokedAt: null,
            revokedById: null,
            revokedByRole: null,
            revokedReason: null,
          },
        })
      } else {
        device = await prisma.device.create({
          data: { staffRecordId: staff.id, deviceKey, deviceName, deviceType, ipAddress, userAgent },
        })
      }
      await logStaffActivity({
        staffRecordId: staff.id,
        companyId: staff.companyId,
        action: 'DEVICE_REGISTERED',
        performedById: staff.id,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: staff.role,
        details: { deviceId: device.id, deviceName, deviceType, ipAddress },
      })
    }
  }

  const [company, enabledModules, archivedModules, phedRoleGrant, elevatedRole] = await Promise.all([
    prisma.company.findUnique({
      where: { id: staff.companyId },
      select: { id: true, companyName: true, email: true, phone: true, address: true },
    }),
    staff.role === 'SUPER_ADMIN' ? getEnabledModules(undefined) : getEnabledModules(staff.companyId),
    getArchivedModuleKeys(),
    prisma.phedStaffAccessRole.findUnique({
      where: { staffRecordId: staff.id },
      select: { accessRole: true },
    }),
    staff.role === 'SUPER_ADMIN' ? null : getActiveElevatedRole(staff.id, staff.companyId),
  ])

  const token = signToken({
    userId: staff.id,
    email: staff.email,
    role: staff.role,
    companyId: staff.companyId,
    enabledModules,
    deviceId: device!.id,
  })

  await logStaffActivity({
    staffRecordId: staff.id,
    companyId: staff.companyId,
    action: activityAction,
    performedById: staff.id,
    performedByName: `${staff.firstName} ${staff.lastName}`,
    performedByRole: staff.role,
    details: { deviceId: device!.id, deviceName: device!.deviceName, ipAddress: device!.ipAddress },
  })

  return {
    ok: true,
    token,
    user: {
      id: staff.id,
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: staff.role,
      phedAccessRole: phedRoleGrant?.accessRole ?? null,
      elevatedRole: elevatedRole || null,
      companyId: staff.companyId,
      department: staff.department,
      position: staff.position,
      designation: (staff as any).designation?.title || staff.position || null,
      designationCode: (staff as any).designation?.code || null,
      staffId: staff.staffId,
      requirePasswordChange: (staff as any).requirePasswordChange ?? false,
    },
    company: company
      ? {
          id: company.id,
          companyName: company.companyName,
          email: company.email,
          phone: company.phone,
          address: company.address,
        }
      : null,
    enabledModules,
    archivedModules,
  }
}
