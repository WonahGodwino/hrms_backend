// src/app/api/leaves/[id]/manager-approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { sendLeaveNotificationEmail } from '@/app/lib/email'
import { prisma } from '@/app/lib/db'
import { requireAuth } from '@/app/lib/auth'
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
    // Authenticate the user (any authenticated user can attempt, we'll check permissions below)
    const user = requireAuth(token)

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

    // Get the current user's staff record
    const currentStaff = await prisma.staffRecord.findFirst({
      where: { email: user.email, isActive: true }
    })
    
    if (!currentStaff) {
      return withCors(
        ApiResponse.error('Staff record not found', 404),
        origin
      )
    }

    // Check permissions:
    // 1. Is the current user the manager of the staff member? (managerId matches)
    // 2. OR is the current user HR/Admin/Super Admin (can override)
    const isManager = leaveRequest.staffRecord.managerId === currentStaff.id
    const isHRAdmin = ['HR', 'ADMIN', 'SUPER_ADMIN'].includes(currentStaff.role)
    
    if (!isManager && !isHRAdmin) {
      return withCors(
        ApiResponse.error('Only the staff manager or HR/Admin can approve this leave request', 403),
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
            managerApproverId: currentStaff.id,
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
            managerApproverId: currentStaff.id,
            managerApprovedAt: new Date(),
            managerApprovedBy: user.email || user.userId,
            managerComments: body.comments || null,
            hrApprovedAt: new Date(),
            hrApprovedBy: user.email || user.userId,
            hrApproverUserId: user.userId,
            hrApproverRole: currentStaff.role
          }
        }
      } else if (body.action === 'REJECT') {
        newStatus = 'REJECTED'
        nextStep = 'COMPLETED'
        updateData = {
          ...updateData,
          status: newStatus,
          currentStep: nextStep,
          managerApproverId: currentStaff.id,
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
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              companyId: true
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

    // Send notification based on action
    try {
      if (body.action === 'APPROVE') {
        if (updatedLeave.currentStep === 'HR') {
          // Notify HR
          const hrUsers = await prisma.staffRecord.findMany({
            where: {
              companyId: updatedLeave.staffRecord.companyId,
              role: { in: ['HR', 'ADMIN', 'SUPER_ADMIN'] },
              isActive: true
            },
            select: { email: true, firstName: true, lastName: true, id: true }
          })
          for (const hr of hrUsers) {
            await sendLeaveNotificationEmail(
              {
                id: hr.id,
                companyId: updatedLeave.staffRecord.companyId,
                firstName: hr.firstName,
                lastName: hr.lastName,
                email: hr.email,
                staffId: '',
                department: null,
                position: null,
                isRegistered: true
              },
              {
                id: updatedLeave.id,
                referenceNumber: updatedLeave.referenceNumber ?? undefined,
                leaveType: updatedLeave.leaveType.name,
                startDate: updatedLeave.startDate,
                endDate: updatedLeave.endDate,
                totalDays: Number(updatedLeave.totalDays),
                status: updatedLeave.status,
                currentStep: updatedLeave.currentStep
              },
              'HR_APPROVAL'
            )
          }
        } else if (updatedLeave.status === 'APPROVED') {
          // Notify staff
          await sendLeaveNotificationEmail(
            {
              id: updatedLeave.staffRecord.id,
              companyId: updatedLeave.staffRecord.companyId,
              firstName: updatedLeave.staffRecord.firstName,
              lastName: updatedLeave.staffRecord.lastName,
              email: updatedLeave.staffRecord.email,
              staffId: '',
              department: null,
              position: null,
              isRegistered: true
            },
            {
              id: updatedLeave.id,
              referenceNumber: updatedLeave.referenceNumber ?? undefined,
              leaveType: updatedLeave.leaveType.name,
              startDate: updatedLeave.startDate,
              endDate: updatedLeave.endDate,
              totalDays: Number(updatedLeave.totalDays),
              status: updatedLeave.status,
              currentStep: updatedLeave.currentStep
            },
            'APPROVED'
          )
        }
      } else if (body.action === 'REJECT') {
        // Notify staff
        await sendLeaveNotificationEmail(
          {
            id: updatedLeave.staffRecord.id,
            companyId: updatedLeave.staffRecord.companyId,
            firstName: updatedLeave.staffRecord.firstName,
            lastName: updatedLeave.staffRecord.lastName,
            email: updatedLeave.staffRecord.email,
            staffId: '',
            department: null,
            position: null,
            isRegistered: true
          },
          {
            id: updatedLeave.id,
            referenceNumber: updatedLeave.referenceNumber ?? undefined,
            leaveType: updatedLeave.leaveType.name,
            startDate: updatedLeave.startDate,
            endDate: updatedLeave.endDate,
            totalDays: Number(updatedLeave.totalDays),
            status: updatedLeave.status,
            currentStep: updatedLeave.currentStep
          },
          'REJECTED'
        )
      }
    } catch (e) {
      console.error('Failed to send leave approval email:', e)
    }

    // Count supervisees (staff who have this user as managerId)
    const superviseesCount = await prisma.staffRecord.count({
      where: {
        managerId: currentStaff.id,
        isActive: true
      }
    })

    const pendingSuperviseeApprovalsCount = await prisma.leaveRequest.count({
      where: {
        status: 'PENDING',
        currentStep: 'MANAGER',
        staffRecord: {
          managerId: currentStaff.id,
          isActive: true
        }
      }
    })

    return withCors(
      ApiResponse.success({
        leave: updatedLeave,
        supervision: {
          superviseesCount,
          pendingSuperviseeApprovalsCount,
          isManager: superviseesCount > 0
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