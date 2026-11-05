// src/app/api/admin/staff/[id]/set-password/route.ts
//
// Device Management — HR/ADMIN/SUPER_ADMIN directly sets a staff member's
// password (relayed to them out-of-band). A plain, permanent password set —
// does NOT force a re-change at next login; see ./unregister for the action
// that makes a user pick their own new password. All of their devices are
// deactivated and sessions cleared immediately, same as the block route.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole, hashPassword } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { checkStaffAccess } from '@/app/lib/staff-access'
import { logStaffActivity } from '@/app/lib/device/device-utils'
import { createNotification } from '@/app/lib/notifications/helpers'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const currentUser = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    const body = await request.json().catch(() => ({}))
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
    if (newPassword.length < 8) {
      return withCors(ApiResponse.error('New password must be at least 8 characters', 400), origin)
    }

    const target = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, role: true },
    })
    if (!target) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    if (target.id === currentUser.userId) {
      return withCors(ApiResponse.error('You cannot change your own password here — use Change Password from your profile instead', 400), origin)
    }

    if (currentUser.role !== 'SUPER_ADMIN') {
      const hasCompanyAccess = await checkStaffAccess(currentUser, target.companyId)
      if (!hasCompanyAccess) {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
      // Same downward-authority boundary as block/unblock and device visibility.
      if (target.role !== 'STAFF') {
        return withCors(ApiResponse.error('Only a Super Admin can change this user\'s password', 403), origin)
      }
    }

    const now = new Date()
    const actor = await prisma.staffRecord.findUnique({
      where: { id: currentUser.userId },
      select: { firstName: true, lastName: true },
    })
    const currentUserName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : currentUser.email

    const hashed = await hashPassword(newPassword)

    await prisma.$transaction([
      prisma.staffRecord.update({
        where: { id: target.id },
        data: { password: hashed, updatedBy: currentUser.userId },
      }),
      prisma.device.updateMany({
        where: { staffRecordId: target.id, isActive: true },
        data: {
          isActive: false,
          revokedAt: now,
          revokedById: currentUser.userId,
          revokedByRole: currentUser.role,
          revokedReason: 'PASSWORD_RESET',
        },
      }),
    ])

    await logStaffActivity({
      staffRecordId: target.id,
      companyId: target.companyId,
      action: 'PASSWORD_RESET_BY_ADMIN',
      performedById: currentUser.userId,
      performedByName: currentUserName,
      performedByRole: currentUser.role,
    })

    await createNotification(
      target.id,
      'ACCOUNT_PASSWORD_RESET',
      'Your password was changed',
      `Your account password was changed by ${currentUserName}. If you did not expect this, contact your HR administrator.`,
      {},
      target.companyId
    )

    return withCors(ApiResponse.success({ staffId: target.id }, 'Password updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
