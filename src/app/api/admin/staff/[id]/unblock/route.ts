// src/app/api/admin/staff/[id]/unblock/route.ts
//
// Device Management — unblock authority is asymmetric: if HR/ADMIN blocked
// the user, any HR/ADMIN in the same company can unblock them; if a
// SUPER_ADMIN blocked them, only a SUPER_ADMIN (any company) can unblock.
// Does not restore previously cleared devices — the user simply resumes
// normal 3-slot login behavior on their next sign-in.
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

    const target = await prisma.staffRecord.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, isBlocked: true, blockedByRole: true },
    })
    if (!target) {
      return withCors(ApiResponse.error('Staff record not found', 404), origin)
    }

    if (!target.isBlocked) {
      return withCors(ApiResponse.error('This user is not blocked', 400), origin)
    }

    if (target.blockedByRole === 'SUPER_ADMIN') {
      if (currentUser.role !== 'SUPER_ADMIN') {
        return withCors(ApiResponse.error('Only a Super Admin can unblock this user.', 403), origin)
      }
    } else if (currentUser.role !== 'SUPER_ADMIN') {
      const hasCompanyAccess = await checkStaffAccess(currentUser, target.companyId)
      if (!hasCompanyAccess) {
        return withCors(
          ApiResponse.error("Only HR/Admin from this user's company can unblock them.", 403),
          origin
        )
      }
    }

    const actor = await prisma.staffRecord.findUnique({
      where: { id: currentUser.userId },
      select: { firstName: true, lastName: true },
    })
    const currentUserName = actor ? `${actor.firstName} ${actor.lastName}`.trim() : currentUser.email

    await prisma.staffRecord.update({
      where: { id: target.id },
      data: {
        isBlocked: false,
        blockedAt: null,
        blockedById: null,
        blockedByName: null,
        blockedByRole: null,
        blockReason: null,
      },
    })

    await logStaffActivity({
      staffRecordId: target.id,
      companyId: target.companyId,
      action: 'STAFF_UNBLOCKED',
      performedById: currentUser.userId,
      performedByName: currentUserName,
      performedByRole: currentUser.role,
    })

    await createNotification(
      target.id,
      'ACCOUNT_UNBLOCKED',
      'Your access has been restored',
      `Your account access was restored by ${currentUserName}. You can now sign in again.`,
      {},
      target.companyId
    )

    return withCors(ApiResponse.success({ staffId: target.id, isBlocked: false }, 'User unblocked'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
