// /src/app/api/leaves/route.ts - Fixed GET endpoint
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decimalToNumber } from '@/app/lib/prisma-utils'

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
          
          if (staffInCompanies.length > 0) {
            where.staffRecordId = { 
              in: staffInCompanies.map(s => s.id) 
            }
          } else {
            // No accessible staff, return empty result
            where.id = 'none' // This will return no results
          }
        }
      } else {
        // Get all leaves in accessible companies
        if (user.role !== 'SUPER_ADMIN') {
          if (accessibleCompanyIds.length > 0) {
            const staffInCompanies = await prisma.staffRecord.findMany({
              where: { 
                companyId: { in: accessibleCompanyIds },
                isActive: true 
              },
              select: { id: true }
            })
            
            if (staffInCompanies.length > 0) {
              where.staffRecordId = { 
                in: staffInCompanies.map(s => s.id) 
              }
            } else {
              // No accessible staff, return empty result
              where.id = 'none' // This will return no results
            }
          } else {
            // No accessible companies, return empty result
            where.id = 'none' // This will return no results
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
      }),
      prisma.leaveRequest.count({ where })
    ])

    // Format leaves with decimal conversion
    const formattedLeaves = leaves.map(leave => ({
      ...leave,
      totalDays: decimalToNumber(leave.totalDays)
    }))

    // Calculate leave statistics
    const stats = await calculateLeaveStatistics(user, parseInt(year))

    return withCors(
      ApiResponse.success({
        leaves: formattedLeaves,
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

// POST method redirects to apply endpoint
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  return withCors(
    ApiResponse.error(
      'Please use /api/leaves/apply for submitting leave applications. ' +
      'This endpoint is for listing leaves only.',
      410 // 410 Gone - indicates resource is no longer available
    ),
    origin
  )
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
    // Build where clause for HR approvals
    const whereClause: any = {
      status: 'MANAGER_APPROVED',
      currentStep: 'HR'
    }
    
    // Add company filter for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const accessibleStaffIds = await getAccessibleStaffIds(user)
      if (accessibleStaffIds) {
        whereClause.staffRecordId = accessibleStaffIds
      } else {
        // No accessible staff, set impossible condition
        whereClause.id = 'none'
      }
    }
    
    pendingHRApprovals = await prisma.leaveRequest.count({
      where: whereClause
    })
  }
  
  // Get current month stats
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  
  // Build where clause for month stats
  const monthWhereClause: any = {
    status: 'APPROVED',
    startDate: {
      gte: currentMonthStart,
      lte: currentMonthEnd
    }
  }
  
  // Add company filter for non-SUPER_ADMIN
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'MANAGER' && user.role !== 'STAFF') {
    const accessibleStaffIds = await getAccessibleStaffIds(user)
    if (accessibleStaffIds) {
      monthWhereClause.staffRecordId = accessibleStaffIds
    } else {
      monthWhereClause.id = 'none'
    }
  }
  
  const approvedThisMonth = await prisma.leaveRequest.count({
    where: monthWhereClause
  })
  
  const rejectedThisMonth = await prisma.leaveRequest.count({
    where: {
      status: 'REJECTED',
      startDate: {
        gte: currentMonthStart,
        lte: currentMonthEnd
      },
      ...(user.role !== 'SUPER_ADMIN' && user.role !== 'MANAGER' && user.role !== 'STAFF' 
        ? await getStaffFilter(user) 
        : {})
    }
  })
  
  // Get team members currently on leave
  const today = new Date()
  const teamOnLeaveWhere: any = {
    status: 'APPROVED',
    startDate: { lte: today },
    endDate: { gte: today }
  }
  
  if (user.role === 'MANAGER') {
    const staffRecord = await prisma.staffRecord.findFirst({
      where: { email: user.email, isActive: true }
    })
    
    if (staffRecord) {
      const directReportIds = await prisma.staffRecord.findMany({
        where: { managerId: staffRecord.id, isActive: true },
        select: { id: true }
      })
      
      const teamIds = [staffRecord.id, ...directReportIds.map(dr => dr.id)]
      teamOnLeaveWhere.staffRecordId = { in: teamIds }
    }
  } else if (['HR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role) && user.role !== 'SUPER_ADMIN') {
    const accessibleStaffIds = await getAccessibleStaffIds(user)
    if (accessibleStaffIds) {
      teamOnLeaveWhere.staffRecordId = accessibleStaffIds
    } else {
      teamOnLeaveWhere.id = 'none'
    }
  }
  
  const teamOnLeave = await prisma.leaveRequest.count({
    where: teamOnLeaveWhere
  })
  
  return {
    pendingManagerApprovals,
    pendingHRApprovals,
    approvedThisMonth,
    rejectedThisMonth,
    teamOnLeave
  }
}

// Helper function to get accessible staff IDs for HR/Admin
async function getAccessibleStaffIds(user: any): Promise<{ in: string[] } | null> {
  const accessibleCompanyIds = await getUserAccessibleCompanies(user)
  
  if (accessibleCompanyIds.length === 0) {
    return null
  }
  
  const staffInCompanies = await prisma.staffRecord.findMany({
    where: { 
      companyId: { in: accessibleCompanyIds },
      isActive: true 
    },
    select: { id: true }
  })
  
  if (staffInCompanies.length === 0) {
    return null
  }
  
  return { 
    in: staffInCompanies.map(s => s.id) 
  }
}

// Helper function to get staff filter for queries
async function getStaffFilter(user: any): Promise<any> {
  const accessibleStaffIds = await getAccessibleStaffIds(user)
  if (accessibleStaffIds) {
    return { staffRecordId: accessibleStaffIds }
  }
  return { id: 'none' } // Return no results
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