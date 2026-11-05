// src/app/api/auth/login/route.ts
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { signToken } from '@/app/lib/auth'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { getEnabledModules, getArchivedModuleKeys } from '@/app/lib/module-access'
import { getActiveElevatedRole } from '@/app/lib/role-elevation'
import { getClientIp, logStaffActivity, parseUserAgent } from '@/app/lib/device/device-utils'

const MAX_DEVICES = 3

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const rl = phedRateLimit(request, 'auth')
  if (rl) return withCors(rl, origin)

  try {
    const body = await request.json()
    const { email, password, companyId, dropDeviceId } = body || {}

    if (!email || !password) {
      return withCors(ApiResponse.error('Email and password are required', 400), origin)
    }

    const cleanEmail = email.toLowerCase().trim()

    // Multi-company safe lookup — only ever consider active accounts
    const candidates = companyId
      ? await prisma.staffRecord.findMany({
          where: {
            email: cleanEmail,
            companyId: companyId.toString(),
            isActive: true,
          },
          include: {
            designation: { select: { id: true, title: true, code: true } },
          },
        })
      : await prisma.staffRecord.findMany({
          where: { email: cleanEmail, isActive: true },
          include: {
            designation: { select: { id: true, title: true, code: true } },
          },
        })

    if (candidates.length === 0) {
      // No active account for this email (or email/company combo) → generic invalid credentials
      return withCors(ApiResponse.error('Invalid credentials', 401), origin)
    }

    // Same email can exist across multiple companies. Try the password against
    // each candidate and log in to whichever company it actually matches —
    // only fall back to "Invalid credentials" once none of them match.
    let staff = null
    for (const candidate of candidates) {
      if (!candidate.password) continue
      if (await bcrypt.compare(password, candidate.password)) {
        staff = candidate
        break
      }
    }

    if (!staff) {
      return withCors(ApiResponse.error('Invalid credentials', 401), origin)
    }

    // Blocked accounts are rejected before anything else — a clear, specific
    // message so the person knows to contact HR rather than assuming a
    // password problem.
    if (staff.isBlocked) {
      await logStaffActivity({
        staffRecordId: staff.id,
        companyId: staff.companyId,
        action: 'LOGIN_BLOCKED_ATTEMPT',
        performedById: staff.id,
        performedByName: `${staff.firstName} ${staff.lastName}`,
        performedByRole: staff.role,
      })
      return withCors(
        ApiResponse.error(
          'Your access has been restricted. Please contact your HR administrator.',
          403,
          [],
          { code: 'ACCOUNT_BLOCKED' }
        ),
        origin
      )
    }

    // Enforce registration only for STAFF, not for SUPER_ADMIN / HR
    if (staff.role === 'STAFF' && !staff.isRegistered) {
      return withCors(ApiResponse.error('Complete registration before login', 403), origin)
    }

    // ---- Device Management: capture/cap/evict ----
    // A device evicted to make room for a 4th one is ARCHIVED (kept for the
    // account's device history), never deleted — see Device.archivedAt.
    // Only non-archived rows occupy slots against the 3-device cap.
    const deviceKey = request.headers.get('x-device-id') || randomUUID()
    const ipAddress = getClientIp(request)
    const userAgent = request.headers.get('user-agent')
    const { deviceName, deviceType } = parseUserAgent(userAgent)

    let device = await prisma.device.findUnique({
      where: { staffRecordId_deviceKey: { staffRecordId: staff.id, deviceKey } },
    })

    if (device && !device.archivedAt) {
      // Same device logging in again — reactivate, does not count against the cap.
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
      // New device, or a previously evicted one coming back — both go through
      // cap-aware registration (a returning device must not bypass the cap).
      const deviceCount = await prisma.device.count({
        where: { staffRecordId: staff.id, archivedAt: null },
      })

      if (deviceCount < MAX_DEVICES) {
        const isReturningEvicted = Boolean(device)
        if (device) {
          // Returning evicted device with a free slot — unarchive its old row
          // (preserving createdAt, i.e. when the account first used it).
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
        // All 3 slots taken by other devices — the frontend must present a
        // picker so the person can free one before this login can proceed.
        const existingDevices = await prisma.device.findMany({
          where: { staffRecordId: staff.id, archivedAt: null },
          select: { id: true, deviceName: true, deviceType: true, ipAddress: true, lastActiveAt: true, isActive: true },
          orderBy: { lastActiveAt: 'desc' },
        })
        return withCors(
          ApiResponse.error(
            'Device limit reached. Choose a device to remove before signing in on this new device.',
            409,
            [],
            { code: 'DEVICE_LIMIT_REACHED', devices: existingDevices }
          ),
          origin
        )
      } else {
        const droppedDevice = await prisma.device.findFirst({
          where: { id: dropDeviceId, staffRecordId: staff.id, archivedAt: null },
        })
        if (!droppedDevice) {
          return withCors(ApiResponse.error('Selected device not found', 400), origin)
        }

        // Archive instead of delete — the device's record survives in the
        // account's device history and can be reactivated by a later login
        // from that same browser if a slot is free.
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
          // The incoming device is the previously evicted row itself —
          // unarchive it in place (createdAt preserved).
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

    // Fetch company, enabled modules, PHED access role, and any ACTIVE temporary
    // role-elevation (e.g. staff elevated to HR/ADMIN to sit on an interview panel)
    // in parallel.
    const [company, enabledModules, archivedModules, phedRoleGrant, elevatedRole] = await Promise.all([
      prisma.company.findUnique({
        where: { id: staff.companyId },
        select: { id: true, companyName: true, email: true, phone: true, address: true },
      }),
      staff.role === 'SUPER_ADMIN'
        ? getEnabledModules(undefined)
        : getEnabledModules(staff.companyId),
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
      action: 'LOGIN_SUCCESS',
      performedById: staff.id,
      performedByName: `${staff.firstName} ${staff.lastName}`,
      performedByRole: staff.role,
      details: { deviceId: device!.id, deviceName: device!.deviceName, ipAddress: device!.ipAddress },
    })

    return withCors(
      ApiResponse.success(
        {
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
        },
        'Login successful'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
