// src/app/api/leaves/[id]/manager-approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
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
    const user = requireRole(token, ['MANAGER', 'HR', 'ADMIN', 'SUPER_ADMIN'])

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
            firstName: true,
            lastName: true,
            email: true,
            managerId: true,
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

    // Check if user is the manager approver
    const staffRecord = await prisma.staffRecord.findFirst({
      where: { email: user.email, isActive: true }
    })
    
    if (!staffRecord) {
      return withCors(
        ApiResponse.error('Staff record not found', 404),
        origin
      )
    }

    // Allow HR/ADMIN/SUPER_ADMIN to override manager approval in special cases
    const isHRAdmin = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)
    
    if (!isHRAdmin && leaveRequest.managerApproverId !== staffRecord.id) {
      return withCors(
        ApiResponse.error('You are not authorized to approve this leave request', 403),
        origin
      )
    }

    // Check if already processed
    if (leaveRequest.status !== 'PENDING' || leaveRequest.currentStep !== 'MANAGER') {
      return withCors(
        ApiResponse.error(`Leave request is already ${leaveRequest.status.toLowerCase()}`, 400),
        origin
      )
    }

    // Update leave request
    const updatedLeave = await prisma.$transaction(async (tx) => {
      let newStatus = ''
      let nextStep = ''
      let updateData: any = {
        updatedBy: user.email || user.userId
      }

      if (body.action === 'APPROVE') {
        // Check approval workflow
        if (leaveRequest.leaveType.policy.approvalWorkflow === 'MANAGER_THEN_HR') {
          newStatus = 'MANAGER_APPROVED'
          nextStep = 'HR'
          updateData = {
            ...updateData,
            status: newStatus,
            currentStep: nextStep,
            managerApprovedAt: new Date(),
            managerApprovedBy: user.email || user.userId,
            managerComments: body.comments || null
          }
        } else if (leaveRequest.leaveType.policy.approvalWorkflow === 'MANAGER_ONLY') {
          newStatus = 'APPROVED'
          nextStep = 'COMPLETED'
          updateData = {
            ...updateData,
            status: newStatus,
            currentStep: nextStep,
            managerApprovedAt: new Date(),
            managerApprovedBy: user.email || user.userId,
            managerComments: body.comments || null,
            hrApprovedAt: new Date(), // Auto HR approval for manager-only workflow
            hrApprovedBy: user.email || user.userId,
            hrApproverUserId: user.userId,
            hrApproverRole: user.role
          }
        }
      } else if (body.action === 'REJECT') {
        newStatus = 'REJECTED'
        nextStep = 'COMPLETED'
        updateData = {
          ...updateData,
          status: newStatus,
          currentStep: nextStep,
          rejectionReason: body.comments,
          rejectedByStep: 'MANAGER',
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

      // Update leave balance based on action
      const balance = await tx.staffLeaveBalance.findFirst({
        where: {
          staffRecordId: leaveRequest.staffRecordId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year: new Date().getFullYear()
        }
      })

      if (balance) {
        if (body.action === 'APPROVE' && leaveRequest.leaveType.policy.approvalWorkflow === 'MANAGER_ONLY') {
          // Manager-only approval: update used days
          await tx.staffLeaveBalance.update({
            where: { id: balance.id },
            data: {
              usedDays: { increment: Number(leaveRequest.totalDays) },
              pendingDays: { decrement: Number(leaveRequest.totalDays) }
            }
          })
        } else if (body.action === 'REJECT') {
          // Rejected: remove from pending days
          await tx.staffLeaveBalance.update({
            where: { id: balance.id },
            data: {
              pendingDays: { decrement: Number(leaveRequest.totalDays) }
            }
          })
        }
        // For MANAGER_THEN_HR workflow, keep as pending until HR approves
      }

      return updated
    })

    // TODO: Send notification based on action
    // - If approved and going to HR: notify HR
    // - If approved (manager-only): notify staff
    // - If rejected: notify staff

    // Count supervisees by hierarchy (staff_records.managerId), not by role.
    const [superviseesCount, pendingSuperviseeApprovalsCount] = await Promise.all([
      prisma.staffRecord.count({
        where: {
          managerId: staffRecord.id,
          isActive: true
        }
      }),
      prisma.leaveRequest.count({
        where: {
          status: 'PENDING',
          currentStep: 'MANAGER',
          managerApproverId: staffRecord.id,
          staffRecord: {
            managerId: staffRecord.id,
            isActive: true
          }
        }
      })
    ])

    return withCors(
      ApiResponse.success({
        leave: updatedLeave,
        supervision: {
          superviseesCount,
          pendingSuperviseeApprovalsCount,
          isManagerByHierarchy: superviseesCount > 0
        }
      }, 
        body.action === 'APPROVE' 
          ? (updatedLeave.currentStep === 'HR' 
              ? 'Leave request approved by manager. Awaiting HR/Admin approval.' 
              : 'Leave request approved successfully.')
          : 'Leave request rejected by manager.'
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