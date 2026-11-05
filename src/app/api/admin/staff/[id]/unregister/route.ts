// src/app/api/admin/staff/[id]/unregister/route.ts
//
// Device Management — resets a STAFF account back to its pre-registration
// state: password cleared, isRegistered: false. Their next login attempt is
// rejected by /api/auth/login (role === 'STAFF' && !isRegistered), and they
// must go through /api/auth/complete-registration again (email + staffId +
// a brand-new password of their own choosing). All active devices are
// deactivated immediately, same pattern as block/set-password.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
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
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    const target = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, role: true, isRegistered: true },
    })
    if (!target) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    if (target.id === currentUser.userId) {
      return withCors(ApiResponse.error('You cannot unregister your own account', 400), origin)
    }

    // Registration-gating only applies to STAFF accounts (see login/route.ts)
    // — unregistering anyone else would have no effect, regardless of actor role.
    if (target.role !== 'STAFF') {
      return withCors(ApiResponse.error('Only staff accounts use the registration flow', 400), origin)
    }

    if (currentUser.role !== 'SUPER_ADMIN') {
      const hasCompanyAccess = await checkStaffAccess(currentUser, target.companyId)
      if (!hasCompanyAccess) {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
    }

    if (!target.isRegistered) {
      return withCors(ApiResponse.error('This user has not completed registration yet', 400), origin)
    }

    const now = new Date()
    const actor = await prisma.staffRecord.findUnique({
      where: { id: currentUser.userId },
      select: { firstName: true, lastName: true },
    })
    const currentUserName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : currentUser.email

    await prisma.$transaction([
      prisma.staffRecord.update({
        where: { id: target.id },
        data: { isRegistered: false, password: null, requirePasswordChange: false, updatedBy: currentUser.userId },
      }),
      prisma.device.updateMany({
        where: { staffRecordId: target.id, isActive: true },
        data: {
          isActive: false,
          revokedAt: now,
          revokedById: currentUser.userId,
          revokedByRole: currentUser.role,
          revokedReason: 'UNREGISTERED',
        },
      }),
    ])

    await logStaffActivity({
      staffRecordId: target.id,
      companyId: target.companyId,
      action: 'ACCOUNT_UNREGISTERED',
      performedById: currentUser.userId,
      performedByName: currentUserName,
      performedByRole: currentUser.role,
      details: reason ? { reason } : undefined,
    })

    await createNotification(
      target.id,
      'ACCOUNT_UNREGISTERED',
      'You need to re-register your account',
      `Your account was reset by ${currentUserName}. Please complete registration again with your email and staff ID to set a new password.`,
      reason ? { reason } : {},
      target.companyId
    )

    return withCors(ApiResponse.success({ staffId: target.id, isRegistered: false }, 'User unregistered'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
