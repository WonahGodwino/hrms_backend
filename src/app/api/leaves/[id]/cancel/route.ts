// src/app/api/leaves/[id]/cancel/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decimalToNumber } from '@/app/lib/prisma-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * POST /api/leaves/:id/cancel
 *
 * Cancels a leave request and releases the days it was holding back onto the
 * staff member's balance:
 *   - PENDING / MANAGER_APPROVED  -> the days were only RESERVED (pendingDays),
 *     so pendingDays is decremented.
 *   - APPROVED                    -> the days were already consumed (usedDays),
 *     so usedDays is decremented. An approved leave that has already started is
 *     refused (you can't un-take time already being taken).
 *
 * Who may cancel: the applicant themselves, or an HR/ADMIN (with access to the
 * leave's company) / SUPER_ADMIN acting on their behalf.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['STAFF', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

    const leave = await prisma.leaveRequest.findUnique({ where: { id } })
    if (!leave) {
      return withCors(ApiResponse.error('Leave request not found', 404), origin)
    }

    // ---- Authorization: applicant, or elevated role with company access ----
    const isElevatedRole = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)
    if (!isElevatedRole) {
      const currentStaff = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true },
        select: { id: true },
      })
      if (!currentStaff) {
        return withCors(ApiResponse.error('Staff record not found', 404), origin)
      }
      if (leave.staffRecordId !== currentStaff.id) {
        return withCors(
          ApiResponse.error('You can only cancel your own leave requests', 403),
          origin
        )
      }
    } else if (user.role !== 'SUPER_ADMIN') {
      const userAssignment = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: leave.companyId,
          role: { in: ['HR', 'ADMIN', 'ALL'] },
        },
      })
      if (!userAssignment) {
        return withCors(
          ApiResponse.error('You do not have access to this leave request', 403),
          origin
        )
      }
    }

    // ---- Validate the request is in a cancellable state ----
    const cancellable = ['PENDING', 'MANAGER_APPROVED', 'APPROVED']
    if (!cancellable.includes(leave.status)) {
      return withCors(
        ApiResponse.error(
          `This leave request can no longer be cancelled (current status: ${leave.status}).`,
          400
        ),
        origin
      )
    }

    // An approved leave that is already under way (or past) can't be un-taken.
    if (leave.status === 'APPROVED') {
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      if (new Date(leave.startDate) <= startOfToday) {
        return withCors(
          ApiResponse.error(
            'This leave has already started and cannot be cancelled. Please contact HR.',
            400
          ),
          origin
        )
      }
    }

    const days = Number(decimalToNumber(leave.totalDays))

    // ---- Cancel + restore balance atomically ----
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: leave.id },
        data: {
          status: 'CANCELLED',
          // No dedicated cancellation-reason column exists; rejectionReason is
          // the request's generic "why it didn't proceed" note, reused here.
          rejectionReason: reason || 'Cancelled by request',
          updatedBy: user.userId,
        },
      })

      // Any approval steps still waiting become moot once the request is pulled.
      await tx.leaveApprovalStep.updateMany({
        where: { leaveRequestId: leave.id, status: 'PENDING' },
        data: { status: 'SKIPPED' },
      })

      if (days > 0) {
        const balance = await tx.staffLeaveBalance.findFirst({
          where: {
            staffRecordId: leave.staffRecordId,
            leaveTypeId: leave.leaveTypeId,
            year: new Date().getFullYear(),
          },
        })
        if (balance) {
          // APPROVED consumed usedDays; everything else only held pendingDays.
          // Clamp at 0 so any pre-existing data drift can't push a balance negative.
          const restored =
            leave.status === 'APPROVED'
              ? { usedDays: Math.max(0, balance.usedDays - days) }
              : { pendingDays: Math.max(0, balance.pendingDays - days) }
          await tx.staffLeaveBalance.update({ where: { id: balance.id }, data: restored })
        }
      }
    })

    return withCors(
      ApiResponse.success(
        { id: leave.id, status: 'CANCELLED' },
        'Leave request cancelled successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
