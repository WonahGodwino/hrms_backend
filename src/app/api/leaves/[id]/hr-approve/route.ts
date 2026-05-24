// src/app/api/leaves/[id]/hr-approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sendLeaveNotificationEmail } from '@/app/lib/email'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(
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
    // Only HR, ADMIN, SUPER_ADMIN can approve at HR level
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { id } = await params
    const body = await request.json()
    
    // Validate required fields
    if (!body.action || !['APPROVE', 'REJECT'].includes(body.action)) {
      return withCors(
        ApiResponse.error('Action must be either "APPROVE" or "REJECT"', 400),
        origin
      )
    }

    if (body.action === 'REJECT' && !body.comments) {
      return withCors(
        ApiResponse.error('Comments are required when rejecting leave', 400),
        origin
      )
    }

    // Get the leave request
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        leaveType: {
          include: {
            policy: true
          }
        },
        staffRecord: {
          select: {
            id: true,
            companyId: true
          }
        }
      }
    })

    if (!leaveRequest) {
      return withCors(
        ApiResponse.error('Leave request not found', 404),
        origin
      )
    }

    // Check if user has access to approve this leave
    if (user.role !== 'SUPER_ADMIN') {
      const hasAccess = await checkLeaveAccess(user, leaveRequest.staffRecord.companyId)
      if (!hasAccess) {
        return withCors(
          ApiResponse.error('You do not have access to approve this leave', 403),
          origin
        )
      }
    }

    // Check if at correct step for HR approval
    const approvalWorkflow = leaveRequest.leaveType.policy?.approvalWorkflow;
    const isHROnly = approvalWorkflow === 'HR_ONLY';
    const isManagerThenHR = approvalWorkflow === 'MANAGER_THEN_HR';

    const canHRApprove =
      (isHROnly && leaveRequest.status === 'PENDING' && leaveRequest.currentStep === 'HR') ||
      (isManagerThenHR && leaveRequest.status === 'MANAGER_APPROVED' && leaveRequest.currentStep === 'HR');

    if (!canHRApprove) {
      return withCors(
        ApiResponse.error(`Leave request is not ready for HR approval. Current status: ${leaveRequest.status}`, 400),
        origin
      )
    }

    // Update leave request
    const updatedLeave = await prisma.$transaction(async (tx) => {
      let newStatus = ''
      let updateData: any = {
        updatedBy: user.email || user.userId
      }

      if (body.action === 'APPROVE') {
        newStatus = 'APPROVED'
        updateData = {
          ...updateData,
          status: newStatus,
          currentStep: 'COMPLETED',
          hrApprovedAt: new Date(),
          hrApprovedBy: user.email || user.userId,
          hrApproverUserId: user.userId,
          hrApproverRole: user.role,
          hrComments: body.comments || null
        }
      } else if (body.action === 'REJECT') {
        newStatus = 'REJECTED'
        updateData = {
          ...updateData,
          status: newStatus,
          currentStep: 'COMPLETED',
          rejectionReason: body.comments,
          rejectedByStep: 'HR',
          rejectedById: user.userId
        }
      }

      // Update leave request
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: updateData,
        include: {
          staffRecord: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          },
          leaveType: {
            select: {
              name: true,
              code: true
            }
          }
        }
      })

      // Update leave balance
      const balance = await tx.staffLeaveBalance.findFirst({
        where: {
          staffRecordId: leaveRequest.staffRecordId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: new Date().getFullYear()
        }
      })

      if (balance) {
        if (body.action === 'APPROVE') {
          await tx.staffLeaveBalance.update({
            where: { id: balance.id },
            data: {
              usedDays: { increment: Number(leaveRequest.totalDays) },
              pendingDays: { decrement: Number(leaveRequest.totalDays) }
            }
          })
        } else if (body.action === 'REJECT') {
          await tx.staffLeaveBalance.update({
            where: { id: balance.id },
            data: {
              pendingDays: { decrement: Number(leaveRequest.totalDays) }
            }
          })
        }
      }

      return updated
    })

    // Send notification to staff member about approval/rejection
    try {
      await sendLeaveNotificationEmail(
        {
          id: leaveRequest.staffRecord.id,
          companyId: leaveRequest.staffRecord.companyId,
          firstName: updatedLeave.staffRecord.firstName,
          lastName: updatedLeave.staffRecord.lastName,
          email: updatedLeave.staffRecord.email,
          staffId: '', // If available, add staffId
          department: null,
          position: null,
          isRegistered: true // If available, set actual value
        },
        {
          id: updatedLeave.id,
          referenceNumber: updatedLeave.referenceNumber ?? undefined,
          leaveType: updatedLeave.leaveType.name,
          startDate: updatedLeave.startDate,
          endDate: updatedLeave.endDate,
          totalDays: updatedLeave.totalDays.toNumber(),
          status: updatedLeave.status,
          currentStep: updatedLeave.currentStep
        },
        body.action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      )
    } catch (e) {
      console.error('Failed to send leave approval email:', e)
    }

    return withCors(
      ApiResponse.success(updatedLeave, 
        body.action === 'APPROVE' 
          ? 'Leave request approved by HR/Admin successfully' 
          : 'Leave request rejected by HR/Admin'
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

async function checkLeaveAccess(user: any, companyId: string): Promise<boolean> {
  const userAssignment = await prisma.userCompany.findFirst({
    where: {
      userId: user.userId,
      companyId: companyId,
      role: { in: ['HR', 'ADMIN', 'ALL'] }
    }
  })
  
  return !!userAssignment
}