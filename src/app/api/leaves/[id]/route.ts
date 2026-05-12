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
 * GET /api/leaves/:id
 * Staff can view details of a specific leave request they submitted.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['STAFF', 'MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'])
    const { id } = await params

    const leave = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            companyName: true
          }
        },
        staffRecord: {
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true
          }
        },
        leaveType: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
            policy: {
              select: {
                id: true,
                name: true,
                maxDays: true,
                isPaid: true,
                approvalWorkflow: true,
                noticePeriod: true,
                documentationRequired: true
              }
            }
          }
        },
        managerApprover: {
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true
          }
        },
        handoverStaff: {
          select: {
            id: true,
            staffId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true
          }
        }
      }
    })

    if (!leave) {
      return withCors(
        ApiResponse.error('Leave request not found', 404),
        origin
      )
    }

    const isElevatedRole = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)

    if (!isElevatedRole) {
      const currentStaff = await prisma.staffRecord.findFirst({
        where: {
          email: user.email,
          isActive: true
        },
        select: {
          id: true
        }
      })

      if (!currentStaff) {
        return withCors(
          ApiResponse.error('Staff record not found', 404),
          origin
        )
      }

      if (leave.staffRecordId !== currentStaff.id) {
        return withCors(
          ApiResponse.error('You are not authorized to view this leave request', 403),
          origin
        )
      }
    } else if (user.role !== 'SUPER_ADMIN') {
      const userAssignment = await prisma.userCompany.findFirst({
        where: {
          userId: user.userId,
          companyId: leave.companyId,
          role: { in: ['HR', 'ADMIN', 'ALL'] }
        }
      })

      if (!userAssignment) {
        return withCors(
          ApiResponse.error('You do not have access to this leave request', 403),
          origin
        )
      }
    }

    const employeeName = `${leave.staffRecord.firstName} ${leave.staffRecord.lastName}`.trim()
    const managerName = leave.managerApprover
      ? `${leave.managerApprover.firstName} ${leave.managerApprover.lastName}`.trim()
      : null

    const responseData = {
      id: leave.id,
      status: leave.status,
      leaveStatus: leave.status,
      currentStep: leave.currentStep,
      leaveType: leave.leaveType.name,
      leaveTypeName: leave.leaveType.name,
      leaveTypeCode: leave.leaveType.code,
      startDate: leave.startDate,
      endDate: leave.endDate,
      dates: {
        startDate: leave.startDate,
        endDate: leave.endDate
      },
      totalDays: decimalToNumber(leave.totalDays),
      appliedDate: leave.createdAt,
      appliedAt: leave.createdAt,
      companyName: leave.company.companyName,
      department: leave.staffRecord.department,
      employeeName,
      managerName,
      managerComment: leave.managerComments,
      managerComments: leave.managerComments,
      comment: leave.managerComments,
      leaveReason: leave.reason,
      reason: leave.reason,
      rejectionReason: leave.rejectionReason,
      hrComment: leave.hrComments,
      approvalDates: {
        managerApprovedAt: leave.managerApprovedAt,
        hrApprovedAt: leave.hrApprovedAt
      },
      handoverStaff: leave.handoverStaff,
      emergencyContact: leave.emergencyContact,
      contactPhone: leave.contactPhone,
      attachmentUrl: leave.attachmentUrl,
      fileName: leave.fileName,
      staffRecord: leave.staffRecord,
      leaveTypeDetails: leave.leaveType
    }

    return withCors(
      ApiResponse.success(
        responseData,
        'Leave request details retrieved successfully'
      ),
      origin
    )
  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}
