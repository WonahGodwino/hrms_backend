// src/app/api/leaves/route.ts - UPDATED FOR 2-STEP APPROVAL
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER', 'STAFF'])

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const status = searchParams.get('status')
    const year = searchParams.get('year') || new Date().getFullYear().toString()
    const month = searchParams.get('month')
    const leaveTypeId = searchParams.get('leaveTypeId')
    const staffRecordId = searchParams.get('staffRecordId')
    
    // For managers: get pending manager approvals
    const forManagerApproval = searchParams.get('forManagerApproval') === 'true'
    
    // For HR/ADMIN: get pending HR approvals
    const forHRApproval = searchParams.get('forHRApproval') === 'true'

    const skip = (page - 1) * limit

    // Build base where clause
    const where: any = {}

    // For STAFF users, they can only see their own leaves
    if (user.role === 'STAFF') {
      const staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true }
      })
      
      if (!staffRecord) {
        return withCors(
          ApiResponse.error('Staff record not found', 404),
          origin
        )
      }
      
      where.staffRecordId = staffRecord.id
    }
    // For MANAGER users
    else if (user.role === 'MANAGER') {
      const staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true }
      })
      
      if (!staffRecord) {
        return withCors(
          ApiResponse.error('Staff record not found', 404),
          origin
        )
      }
      
      if (forManagerApproval) {
        // Get pending leaves where user is the manager approver
        where.managerApproverId = staffRecord.id
        where.status = 'PENDING'
        where.currentStep = 'MANAGER'
      } else {
        // Get leaves for user's direct reports + their own
        const directReportIds = await prisma.staffRecord.findMany({
          where: { managerId: staffRecord.id, isActive: true },
          select: { id: true }
        })
        
        const teamIds = [staffRecord.id, ...directReportIds.map(dr => dr.id)]
        where.staffRecordId = { in: teamIds }
      }
    }
    // For HR/ADMIN/SUPER_ADMIN
    else if (['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      // Get accessible companies
      let accessibleCompanyIds: string[] = []
      
      if (user.role !== 'SUPER_ADMIN') {
        const userCompanies = await prisma.userCompany.findMany({
          where: { userId: user.userId, company: { archived: 0 } },
          select: { companyId: true }
        })
        accessibleCompanyIds = userCompanies.map(uc => uc.companyId)
      }
      
      if (forHRApproval) {
        // Get leaves pending HR approval
        where.status = 'MANAGER_APPROVED'
        where.currentStep = 'HR'
        
        if (accessibleCompanyIds.length > 0 && user.role !== 'SUPER_ADMIN') {
          // Filter by accessible companies
          const staffInCompanies = await prisma.staffRecord.findMany({
            where: { 
              companyId: { in: accessibleCompanyIds },
              isActive: true 
            },
            select: { id: true }
          })
          
          where.staffRecordId = { 
            in: staffInCompanies.map(s => s.id) 
          }
        }
      } else {
        // Get all leaves in accessible companies
        if (accessibleCompanyIds.length > 0 && user.role !== 'SUPER_ADMIN') {
          const staffInCompanies = await prisma.staffRecord.findMany({
            where: { 
              companyId: { in: accessibleCompanyIds },
              isActive: true 
            },
            select: { id: true }
          })
          
          where.staffRecordId = { 
            in: staffInCompanies.map(s => s.id) 
          }
        }
      }
    }

    // Apply filters
    if (status) {
      where.status = status
    }
    
    if (staffRecordId) {
      where.staffRecordId = staffRecordId
    }
    
    if (leaveTypeId) {
      where.leaveTypeId = leaveTypeId
    }
    
    if (year) {
      where.startDate = {
        gte: new Date(parseInt(year), 0, 1),
        lt: new Date(parseInt(year) + 1, 0, 1)
      }
    }
    
    if (month) {
      const monthNum = parseInt(month)
      const yearNum = parseInt(year)
      where.startDate = {
        gte: new Date(yearNum, monthNum - 1, 1),
        lt: new Date(yearNum, monthNum, 1)
      }
    }

    // Fetch leaves with related data
    const [leaves, totalCount] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          staffRecord: {
            select: {
              id: true,
              staffId: true,
              firstName: true,
              lastName: true,
              department: true,
              position: true,
              email: true,
              manager: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              company: {
                select: {
                  id: true,
                  companyName: true
                }
              }
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
                  name: true,
                  approvalWorkflow: true
                }
              }
            }
          }
        }
      }),
      prisma.leaveRequest.count({ where })
    ])

    // Calculate leave statistics
    const stats = await calculateLeaveStatistics(user, parseInt(year))

    return withCors(
      ApiResponse.success({
        leaves,
        statistics: stats,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      }),
      origin
    )

  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}

export async function POST(request: NextRequest) {
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
    const user = requireRole(token, ['STAFF', 'HR', 'ADMIN', 'SUPER_ADMIN', 'MANAGER'])

    const body = await request.json()
    
    // Validate required fields
    const requiredFields = ['leaveTypeId', 'startDate', 'endDate', 'reason']
    for (const field of requiredFields) {
      if (!body[field]) {
        return withCors(
          ApiResponse.error(`${field} is required`, 400),
          origin
        )
      }
    }

    // Get staff record
    let staffRecordId = body.staffRecordId
    
    // If user is requesting leave for themselves
    if (!staffRecordId || user.role === 'STAFF' || user.role === 'MANAGER') {
      const staffRecord = await prisma.staffRecord.findFirst({
        where: { email: user.email, isActive: true }
      })
      
      if (!staffRecord) {
        return withCors(
          ApiResponse.error('Staff record not found', 404),
          origin
        )
      }
      
      staffRecordId = staffRecord.id
    } else {
      // Only HR/ADMIN/SUPER_ADMIN can create leave for others
      if (!['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        return withCors(
          ApiResponse.error('You are not authorized to create leave for others', 403),
          origin
        )
      }
    }

    // Validate dates
    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)
    
    if (startDate >= endDate) {
      return withCors(
        ApiResponse.error('End date must be after start date', 400),
        origin
      )
    }
    
    // Check if dates are in the past
    if (startDate < new Date()) {
      return withCors(
        ApiResponse.error('Cannot request leave for past dates', 400),
        origin
      )
    }

    // Calculate total days (excluding weekends and holidays)
    const totalDays = await calculateWorkingDays(
      staffRecordId,
      startDate,
      endDate
    )

    if (totalDays <= 0) {
      return withCors(
        ApiResponse.error('No working days in selected period', 400),
        origin
      )
    }

    // Get leave type with policy
    const leaveType = await prisma.leaveType.findUnique({
      where: { id: body.leaveTypeId },
      include: { policy: true }
    })

    if (!leaveType) {
      return withCors(
        ApiResponse.error('Leave type not found', 404),
        origin
      )
    }

    // Get current year's balance
    const currentYear = new Date().getFullYear()
    const balance = await prisma.staffLeaveBalance.findFirst({
      where: {
        staffRecordId,
        leaveTypeId: body.leaveTypeId,
        year: currentYear
      }
    })

    if (!balance) {
      return withCors(
        ApiResponse.error('No leave balance found for this leave type', 400),
        origin
      )
    }

    // Check if there's enough balance
    const availableDays = balance.totalDays - balance.usedDays - balance.pendingDays
    if (totalDays > availableDays) {
      return withCors(
        ApiResponse.error(`Insufficient leave balance. Available: ${availableDays} days`, 400),
        origin
      )
    }

    // Check for overlapping leave requests
    const overlappingLeaves = await prisma.leaveRequest.findFirst({
      where: {
        staffRecordId,
        status: { in: ['PENDING', 'MANAGER_APPROVED', 'HR_APPROVED', 'APPROVED'] },
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate }
          }
        ]
      }
    })

    if (overlappingLeaves) {
      return withCors(
        ApiResponse.error('You have overlapping leave during this period', 400),
        origin
      )
    }

    // Get staff's manager for approval
    const staff = await prisma.staffRecord.findUnique({
      where: { id: staffRecordId },
      select: { managerId: true }
    })
    
    // Determine approval workflow
    const needsApproval = leaveType.policy.requiresApproval
    const approvalWorkflow = leaveType.policy.approvalWorkflow
    
    let managerApproverId = null
    let initialStatus = 'PENDING'
    let currentStep = 'MANAGER'
    
    if (needsApproval) {
      if (approvalWorkflow === 'MANAGER_THEN_HR') {
        // Two-step approval required
        if (staff?.managerId) {
          managerApproverId = staff.managerId
          initialStatus = 'PENDING'
          currentStep = 'MANAGER'
        } else {
          // If no manager, skip to HR approval
          initialStatus = 'PENDING'
          currentStep = 'HR'
        }
      } else if (approvalWorkflow === 'MANAGER_ONLY') {
        // Only manager approval required
        if (staff?.managerId) {
          managerApproverId = staff.managerId
          initialStatus = 'PENDING'
          currentStep = 'MANAGER'
        } else {
          // If no manager, auto-approve?
          initialStatus = 'APPROVED'
          currentStep = 'COMPLETED'
        }
      } else if (approvalWorkflow === 'HR_ONLY') {
        // Only HR approval required
        initialStatus = 'PENDING'
        currentStep = 'HR'
      }
    } else {
      // No approval needed
      initialStatus = 'APPROVED'
      currentStep = 'COMPLETED'
    }

    // Create leave request
    const leaveRequest = await prisma.$transaction(async (tx) => {
      // Create the leave request
      const newLeave = await tx.leaveRequest.create({
        data: {
          staffRecordId,
          leaveTypeId: body.leaveTypeId,
          startDate,
          endDate,
          totalDays,
          reason: body.reason,
          emergencyContact: body.emergencyContact,
          contactPhone: body.contactPhone,
          handoverTo: body.handoverTo,
          handoverNotes: body.handoverNotes,
          // Approval workflow fields
          status: initialStatus,
          currentStep: currentStep,
          managerApproverId: managerApproverId,
          createdBy: user.email || user.userId
        },
        include: {
          staffRecord: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              company: {
                select: {
                  companyName: true
                }
              },
              manager: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          leaveType: {
            select: {
              name: true,
              code: true,
              policy: {
                select: {
                  approvalWorkflow: true
                }
              }
            }
          }
        }
      })

      // Update pending days in balance if approval is needed
      if (needsApproval && initialStatus === 'PENDING') {
        await tx.staffLeaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: { increment: totalDays }
          }
        })
      } else if (!needsApproval || initialStatus === 'APPROVED') {
        // Auto-approved, update used days
        await tx.staffLeaveBalance.update({
          where: { id: balance.id },
          data: {
            usedDays: { increment: totalDays }
          }
        })
      }

      return newLeave
    })

    // Determine success message based on workflow
    let successMessage = 'Leave request submitted successfully.'
    if (leaveRequest.currentStep === 'MANAGER') {
      const managerName = leaveRequest.staffRecord.manager 
        ? `${leaveRequest.staffRecord.manager.firstName} ${leaveRequest.staffRecord.manager.lastName}`
        : 'your manager'
      successMessage += ` Awaiting approval from ${managerName}.`
    } else if (leaveRequest.currentStep === 'HR') {
      successMessage += ' Awaiting HR/Admin approval.'
    } else if (leaveRequest.status === 'APPROVED') {
      successMessage = 'Leave request approved automatically.'
    }

    return withCors(
      ApiResponse.success(leaveRequest, successMessage),
      origin
    )

  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}

// ==================== APPROVAL ENDPOINTS ====================

// Manager Approval Endpoint
// src/app/api/leaves/[id]/manager-approve/route.ts
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

    const { id } = params
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

    return withCors(
      ApiResponse.success(updatedLeave, 
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

// HR/Admin Approval Endpoint
// src/app/api/leaves/[id]/hr-approve/route.ts
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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

    const { id } = params
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
    if (leaveRequest.status !== 'MANAGER_APPROVED' || leaveRequest.currentStep !== 'HR') {
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

    // TODO: Send notification to staff member about approval/rejection

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

// Helper functions
async function calculateWorkingDays(staffRecordId: string, startDate: Date, endDate: Date): Promise<number> {
  let workingDays = 0
  const currentDate = new Date(startDate)
  
  // Get company holidays
  const staff = await prisma.staffRecord.findUnique({
    where: { id: staffRecordId },
    select: { companyId: true }
  })
  
  const holidays = await prisma.publicHoliday.findMany({
    where: {
      companyId: staff?.companyId,
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    select: { date: true }
  })
  
  const holidayDates = holidays.map(h => h.date.toDateString())
  
  // Iterate through each day
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay()
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Skip holidays
      if (!holidayDates.includes(currentDate.toDateString())) {
        workingDays += 1
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  return workingDays
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

async function calculateLeaveStatistics(user: any, year: number) {
  let pendingManagerApprovals = 0
  let pendingHRApprovals = 0
  
  if (user.role === 'MANAGER') {
    const staffRecord = await prisma.staffRecord.findFirst({
      where: { email: user.email, isActive: true }
    })
    
    if (staffRecord) {
      pendingManagerApprovals = await prisma.leaveRequest.count({
        where: {
          managerApproverId: staffRecord.id,
          status: 'PENDING',
          currentStep: 'MANAGER'
        }
      })
    }
  }
  
  if (['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    pendingHRApprovals = await prisma.leaveRequest.count({
      where: {
        status: 'MANAGER_APPROVED',
        currentStep: 'HR',
        // Filter by accessible companies for non-SUPER_ADMIN
        ...(user.role !== 'SUPER_ADMIN' ? await getCompanyFilter(user) : {})
      }
    })
  }
  
  return {
    pendingManagerApprovals,
    pendingHRApprovals,
    approvedThisMonth: 0,
    rejectedThisMonth: 0,
    teamOnLeave: 0
  }
}

async function getCompanyFilter(user: any) {
  const accessibleCompanyIds = await getUserAccessibleCompanies(user)
  
  if (accessibleCompanyIds.length === 0) {
    return {}
  }
  
  const staffInCompanies = await prisma.staffRecord.findMany({
    where: { 
      companyId: { in: accessibleCompanyIds },
      isActive: true 
    },
    select: { id: true }
  })
  
  return {
    staffRecordId: { 
      in: staffInCompanies.map(s => s.id) 
    }
  }
}

async function getUserAccessibleCompanies(user: any): Promise<string[]> {
  if (user.role === 'SUPER_ADMIN') {
    const companies = await prisma.company.findMany({
      where: { archived: 0 },
      select: { id: true }
    })
    return companies.map(c => c.id)
  }
  
  const userCompanies = await prisma.userCompany.findMany({
    where: { 
      userId: user.userId,
      company: { archived: 0 }
    },
    select: { companyId: true }
  })
  
  return userCompanies.map(uc => uc.companyId)
}