// src/app/api/leaves/admin/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRoleAsync, AuthUser } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decimalToNumber } from '@/app/lib/prisma-utils'
import { LeaveStatusEnum, ApprovalStepEnum } from '@/app/lib/types/leave'

// Define a type for the API response that matches what we return
interface LeaveRequestAdminResponse {
  id: string;
  referenceNumber: string | null;
  staffRecordId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  emergencyContact: string | null;
  contactPhone: string | null;
  status: string;
  currentStep: string;
  managerApproverId: string | null;
  managerApprovedAt: Date | null;
  managerApprovedBy: string | null;
  managerComments: string | null;
  hrApproverUserId: string | null;
  hrApproverRole: string | null;
  hrApprovedAt: Date | null;
  hrApprovedBy: string | null;
  hrComments: string | null;
  rejectionReason: string | null;
  rejectedByStep: string | null;
  rejectedById: string | null;
  handoverTo: string | null;
  handoverStaffId: string | null;
  handoverNotes: string | null;
  attachmentUrl: string | null;
  fileName: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string | null;
  staffRecord: {
    id: string;
    staffId: string;
    firstName: string;
    lastName: string;
    department: string;
    position: string;
    email: string;
    company: {
      id: string;
      companyName: string;
    };
    manager: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
  };
  leaveType: {
    id: string;
    name: string;
    code: string;
    color: string | null;
    policy: {
      id: string;
      name: string;
      approvalWorkflow: string;
      requiresApproval: boolean;
      maxDays: number;
      noticePeriod: number;
      minEmploymentMonths: number;
      isPaid: boolean;
      documentationRequired: boolean;
      carryOver: number;
      accrualRate: number | null;
    } | null;
  };
  managerApprover: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  handoverStaff: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    staffId: string;
  } | null;
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/leaves/admin
 * For HR, ADMIN, SUPER_ADMIN to view and manage leave requests
 * Access is strictly controlled via user_companies table
 */
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
    
    // Use requireRoleAsync to get full user with company assignments
    const user = await requireRoleAsync(token, ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const status = searchParams.get('status')
    const currentStep = searchParams.get('currentStep')
    const year = searchParams.get('year') || new Date().getFullYear().toString()
    const month = searchParams.get('month')
    const leaveTypeId = searchParams.get('leaveTypeId')
    const companyId = searchParams.get('companyId')
    const department = searchParams.get('department')
    const staffName = searchParams.get('staffName')
    const staffId = searchParams.get('staffId')
    
    // Special filters for approval queues
    const pendingManagerApproval = searchParams.get('pendingManagerApproval') === 'true'
    const pendingHRApproval = searchParams.get('pendingHRApproval') === 'true'

    const skip = (page - 1) * limit

    // ============ GET USER'S STAFF RECORD ============
    // Get the staff record using userId from auth
    const staffRecord = await prisma.staffRecord.findFirst({
      where: { 
        id: user.userId // AuthUser has userId, not id
      },
      select: { id: true, companyId: true }
    })

    if (!staffRecord) {
      return withCors(
        ApiResponse.error('Staff record not found', 404),
        origin
      )
    }

    // ============ GET ACCESSIBLE COMPANIES VIA user_companies ============
    // Use the companyIds from the auth user (already populated by requireRoleAsync)
    let accessibleCompanyIds = user.companyIds || []
    
    // If user is SUPER_ADMIN but companyIds not populated, fetch all companies
    if (user.role === 'SUPER_ADMIN' && accessibleCompanyIds.length === 0) {
      const allCompanies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true }
      })
      accessibleCompanyIds = allCompanies.map(c => c.id)
    }
    
    if (accessibleCompanyIds.length === 0) {
      return withCors(
        ApiResponse.success({
          leaves: [],
          summary: {
            pendingManagerApprovals: 0,
            pendingHRApprovals: 0,
            approvedThisMonth: 0,
            rejectedThisMonth: 0,
            totalPending: 0,
            totalApproved: 0,
            totalRejected: 0
          },
          accessibleCompanies: [],
          pagination: {
            page,
            limit,
            totalCount: 0,
            totalPages: 0
          }
        }),
        origin
      )
    }

    // ============ GET ALL STAFF IN ACCESSIBLE COMPANIES ============
    const accessibleStaffRecords = await prisma.staffRecord.findMany({
      where: {
        companyId: { in: accessibleCompanyIds },
        isActive: true
      },
      select: { id: true }
    })

    const accessibleStaffIds = accessibleStaffRecords.map(s => s.id)

    if (accessibleStaffIds.length === 0) {
      return withCors(
        ApiResponse.success({
          leaves: [],
          summary: {
            pendingManagerApprovals: 0,
            pendingHRApprovals: 0,
            approvedThisMonth: 0,
            rejectedThisMonth: 0,
            totalPending: 0,
            totalApproved: 0,
            totalRejected: 0
          },
          accessibleCompanies: await getAccessibleCompaniesList(accessibleCompanyIds),
          pagination: {
            page,
            limit,
            totalCount: 0,
            totalPages: 0
          }
        }),
        origin
      )
    }

    // ============ BUILD WHERE CLAUSE ============
    const where: any = {
      staffRecordId: { in: accessibleStaffIds }
    }

    // Apply approval queue filters
    if (pendingManagerApproval) {
      where.status = LeaveStatusEnum.PENDING
      where.currentStep = ApprovalStepEnum.MANAGER
    }
    
    if (pendingHRApproval) {
      where.status = LeaveStatusEnum.MANAGER_APPROVED
      where.currentStep = ApprovalStepEnum.HR
    }

    // Apply status filter
    if (status) {
      where.status = status
    }

    // Apply current step filter
    if (currentStep) {
      where.currentStep = currentStep
    }
    
    // Apply leave type filter
    if (leaveTypeId) {
      where.leaveTypeId = leaveTypeId
    }
    
    // ============ COMPANY FILTER - VERIFY ACCESS VIA user_companies ============
    if (companyId) {
      // Verify this company is accessible
      if (accessibleCompanyIds.includes(companyId)) {
        const staffInCompany = await prisma.staffRecord.findMany({
          where: { 
            companyId, 
            isActive: true 
          },
          select: { id: true }
        })
        where.staffRecordId = { in: staffInCompany.map(s => s.id) }
      } else {
        // Requested company is not accessible - return empty results
        where.id = 'none'
      }
    }
    
    // Apply date filters
    if (year) {
      const yearNum = parseInt(year)
      where.startDate = {
        gte: new Date(yearNum, 0, 1),
        lt: new Date(yearNum + 1, 0, 1)
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

    // Apply staff search filters
    if (staffName || staffId || department) {
      const staffWhere: any = { id: { in: accessibleStaffIds } }
      
      if (staffName) {
        staffWhere.OR = [
          { firstName: { contains: staffName, mode: 'insensitive' } },
          { lastName: { contains: staffName, mode: 'insensitive' } }
        ]
      }
      
      if (staffId) {
        staffWhere.staffId = { contains: staffId, mode: 'insensitive' }
      }
      
      if (department) {
        staffWhere.department = { contains: department, mode: 'insensitive' }
      }
      
      const filteredStaff = await prisma.staffRecord.findMany({
        where: staffWhere,
        select: { id: true }
      })
      
      where.staffRecordId = { 
        in: filteredStaff.map(s => s.id) 
      }
    }

    // ============ FETCH LEAVES ============
    const leaves = await prisma.leaveRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' }
      ],
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
            company: {
              select: {
                id: true,
                companyName: true
              }
            },
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
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
                id: true,
                name: true,
                approvalWorkflow: true,
                requiresApproval: true,
                maxDays: true,
                noticePeriod: true,
                minEmploymentMonths: true,
                isPaid: true,
                documentationRequired: true,
                carryOver: true,
                accrualRate: true
              }
            }
          }
        },
        managerApprover: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        handoverStaff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            staffId: true
          }
        }
      }
    })

    const totalCount = await prisma.leaveRequest.count({ where })

    // Format leaves with decimal conversion - properly typed
    const formattedLeaves: LeaveRequestAdminResponse[] = leaves.map(leave => ({
      ...leave,
      totalDays: decimalToNumber(leave.totalDays),
      staffRecord: {
        ...leave.staffRecord,
        department: leave.staffRecord?.department ?? '',
      },
      leaveType: leave.leaveType,
      managerApprover: leave.managerApprover,
      handoverStaff: leave.handoverStaff
    }))

    // ============ CALCULATE SUMMARY STATISTICS ============
    const [pendingManagerApprovals, pendingHRApprovals, approvedThisMonth, rejectedThisMonth, totalStats] = await Promise.all([
      // Pending manager approvals
      prisma.leaveRequest.count({
        where: {
          staffRecordId: { in: accessibleStaffIds },
          status: LeaveStatusEnum.PENDING,
          currentStep: ApprovalStepEnum.MANAGER
        }
      }),
      // Pending HR approvals
      prisma.leaveRequest.count({
        where: {
          staffRecordId: { in: accessibleStaffIds },
          status: LeaveStatusEnum.MANAGER_APPROVED,
          currentStep: ApprovalStepEnum.HR
        }
      }),
      // Approved this month
      prisma.leaveRequest.count({
        where: {
          staffRecordId: { in: accessibleStaffIds },
          status: { in: [LeaveStatusEnum.APPROVED, LeaveStatusEnum.HR_APPROVED] },
          startDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
          }
        }
      }),
      // Rejected this month
      prisma.leaveRequest.count({
        where: {
          staffRecordId: { in: accessibleStaffIds },
          status: LeaveStatusEnum.REJECTED,
          startDate: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            lt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
          }
        }
      }),
      // Total counts by status
      prisma.leaveRequest.groupBy({
        by: ['status'],
        where: {
          staffRecordId: { in: accessibleStaffIds }
        },
        _count: true
      })
    ])

    const totalPending = totalStats.find(s => s.status === LeaveStatusEnum.PENDING)?._count || 0
    const totalApproved = totalStats.find(s => [LeaveStatusEnum.APPROVED, LeaveStatusEnum.HR_APPROVED].includes(s.status as any))?._count || 0
    const totalRejected = totalStats.find(s => s.status === LeaveStatusEnum.REJECTED)?._count || 0

    // Get accessible companies list for the response
    const accessibleCompaniesList = await getAccessibleCompaniesList(accessibleCompanyIds)

    return withCors(
      ApiResponse.success({
        leaves: formattedLeaves,
        summary: {
          pendingManagerApprovals,
          pendingHRApprovals,
          approvedThisMonth,
          rejectedThisMonth,
          totalPending,
          totalApproved,
          totalRejected
        },
        accessibleCompanies: accessibleCompaniesList,
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

// Internal helper - not exported
async function getAccessibleCompaniesList(companyIds: string[]) {
  return await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: {
      id: true,
      companyName: true
    },
    orderBy: { companyName: 'asc' }
  })
}