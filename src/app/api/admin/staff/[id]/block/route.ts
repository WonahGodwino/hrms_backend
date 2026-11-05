// src/app/api/admin/staff/[id]/block/route.ts
//
// Device Management — block a user. All of their devices are deactivated
// and sessions cleared immediately; an already-open browser session gets
// logged out within the ~60s session-status polling window (see
// /api/auth/session-status and AuthContext.jsx). Their next login attempt
// is rejected with a "contact your HR" message (see /api/auth/login).
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
    if (!reason) {
      return withCors(ApiResponse.error('A reason is required to block a user', 400), origin)
    }

    const target = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, role: true, firstName: true, lastName: true, isBlocked: true },
    })
    if (!target) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    if (target.id === currentUser.userId) {
      return withCors(ApiResponse.error('You cannot block your own account', 400), origin)
    }

    if (currentUser.role !== 'SUPER_ADMIN') {
      const hasCompanyAccess = await checkStaffAccess(currentUser, target.companyId)
      if (!hasCompanyAccess) {
        return withCors(ApiResponse.error('You do not have access to this staff record', 403), origin)
      }
      // HR/ADMIN may only act on STAFF-role users — same downward-authority
      // boundary as device visibility.
      if (target.role !== 'STAFF') {
        return withCors(ApiResponse.error('Only a Super Admin can block this user', 403), origin)
      }
    }

    if (target.isBlocked) {
      return withCors(ApiResponse.error('This user is already blocked', 400), origin)
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
        data: {
          isBlocked: true,
          blockedAt: now,
          blockedById: currentUser.userId,
          blockedByName: currentUserName,
          blockedByRole: currentUser.role,
          blockReason: reason,
        },
      }),
      prisma.device.updateMany({
        where: { staffRecordId: target.id, isActive: true },
        data: {
          isActive: false,
          revokedAt: now,
          revokedById: currentUser.userId,
          revokedByRole: currentUser.role,
          revokedReason: 'BLOCKED',
        },
      }),
    ])

    await logStaffActivity({
      staffRecordId: target.id,
      companyId: target.companyId,
      action: 'STAFF_BLOCKED',
      performedById: currentUser.userId,
      performedByName: currentUserName,
      performedByRole: currentUser.role,
      details: { reason },
    })

    await createNotification(
      target.id,
      'ACCOUNT_BLOCKED',
      'Your access has been restricted',
      `Your account access was restricted by ${currentUserName}. Please contact your HR administrator for more details.`,
      { reason },
      target.companyId
    )

    return withCors(ApiResponse.success({ staffId: target.id, isBlocked: true }, 'User blocked'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
