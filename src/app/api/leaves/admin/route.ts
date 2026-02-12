// /src/app/api/leaves/admin/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decimalToNumber } from '@/app/lib/prisma-utils'
import { 
  getAccessibleCompanyIds, 
  getAccessibleStaffIds,
  UserContext 
} from '@/app/lib/access-control'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/leaves/admin
 * For HR, ADMIN, SUPER_ADMIN to view and manage leave requests
 * Access is strictly controlled via UserCompany table
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
    const user = requireRole(token, ['HR', 'ADMIN', 'SUPER_ADMIN']) as UserContext

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

    // ============ CRITICAL: GET ACCESSIBLE COMPANIES VIA UserCompany ============
    const accessibleCompanyIds = await getAccessibleCompanyIds(user)
    
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
    const accessibleStaffIds = await getAccessibleStaffIds(user)

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
      where.status = 'PENDING'
      where.currentStep = 'MANAGER'
    }
    
    if (pendingHRApproval) {
      where.status = 'MANAGER_APPROVED'
      where.currentStep = 'HR'
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
    
    // ============ COMPANY FILTER - VERIFY ACCESS FIRST ============
    if (companyId) {
      // Verify this company is accessible via UserCompany
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
    const [leaves, totalCount] = await Promise.all([
      prisma.leaveRequest.findMany({
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
                  name: true,
                  approvalWorkflow: true,
                  requiresApproval: true
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
          },
          company: {
            select: {
              id: true,
              companyName: true
            }
          }
        }
      }),
      prisma.leaveRequest.count({ where })
    ])

    // Format leaves with decimal conversion
    const formattedLeaves = leaves.map(leave => ({
      ...leave,
      totalDays: decimalToNumber(leave.totalDays)
    }))

    // ============ CALCULATE SUMMARY STATISTICS ============
    const [pendingManagerApprovals, pendingHRApprovals, approvedThisMonth, rejectedThisMonth, totalStats] = await Promise.all([
      // Pending manager approvals
      prisma.leaveRequest.count({
        where: {
          staffRecordId: { in: accessibleStaffIds },
          status: 'PENDING',
          currentStep: 'MANAGER'
        }
      }),
      // Pending HR approvals
      prisma.leaveRequest.count({
        where: {
          staffRecordId: { in: accessibleStaffIds },
          status: 'MANAGER_APPROVED',
          currentStep: 'HR'
        }
      }),
      // Approved this month
      prisma.leaveRequest.count({
        where: {
          staffRecordId: { in: accessibleStaffIds },
          status: 'APPROVED',
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
          status: 'REJECTED',
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

    const totalPending = totalStats.find(s => s.status === 'PENDING')?._count || 0
    const totalApproved = totalStats.find(s => s.status === 'APPROVED')?._count || 0
    const totalRejected = totalStats.find(s => s.status === 'REJECTED')?._count || 0

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