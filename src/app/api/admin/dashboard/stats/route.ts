// src/app/api/admin/dashboard/stats/route.ts
// src/app/api/admin/dashboard/overview/route.ts
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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'STAFF'])

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') || new Date().getFullYear().toString()
    const month = searchParams.get('month') || new Date().getMonth() + 1 // Current month (1-12)
    const companyId = searchParams.get('companyId')

    // Initialize response object
    const response: any = {
      userRole: user.role,
      period: {
        year: parseInt(year),
        month: parseInt(month),
        currentDate: new Date().toISOString().split('T')[0]
      }
    }

    // COMMON STATISTICS (for all roles)
    let accessibleCompanyIds: string[] = []
    let currentMonth = parseInt(month)
    let currentYear = parseInt(year)
    
    // Get accessible companies based on role
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN can access all non-archived companies
      const companies = await prisma.company.findMany({
        where: { archived: 0 },
        select: { id: true }
      })
      accessibleCompanyIds = companies.map(c => c.id)
    } else if (user.role === 'ADMIN' || user.role === 'HR') {
      // ADMIN/HR can access only their assigned companies
      const userCompanies = await prisma.userCompany.findMany({
        where: {
          userId: user.userId,
          company: { archived: 0 }
        },
        select: { companyId: true }
      })
      accessibleCompanyIds = userCompanies.map(uc => uc.companyId)
      
      if (accessibleCompanyIds.length === 0) {
        return withCors(
          ApiResponse.error('No companies assigned to your account', 403),
          origin
        )
      }
    }

    // Apply company filter if specified
    let targetCompanyIds = accessibleCompanyIds
    if (companyId && accessibleCompanyIds.includes(companyId)) {
      targetCompanyIds = [companyId]
    }

    // ROLE-SPECIFIC STATISTICS
    switch (user.role) {
      case 'SUPER_ADMIN':
        response.stats = await getSuperAdminStats(targetCompanyIds, currentYear, currentMonth)
        break
        
      case 'ADMIN':
        response.stats = await getAdminStats(user.userId, targetCompanyIds, currentYear, currentMonth)
        break
        
      case 'HR':
        response.stats = await getHRStats(user.userId, targetCompanyIds, currentYear, currentMonth)
        break
        
      case 'STAFF':
        response.stats = await getStaffStats(user.userId, currentYear, currentMonth)
        break
        
      default:
        return withCors(
          ApiResponse.error('Invalid user role', 403),
          origin
        )
    }

    return withCors(
      ApiResponse.success(response, 'Dashboard statistics fetched successfully'),
      origin
    )

  } catch (error) {
    return withCors(
      handleApiError(error),
      origin
    )
  }
}

// ==================== STATISTICS FUNCTIONS ====================

// SUPER_ADMIN Statistics
async function getSuperAdminStats(companyIds: string[], year: number, month: number) {
  const [
    totalPayslips,
    totalStaff,
    totalHRUsers,
    totalAdminUsers,
    totalSuperAdmins,
    totalCompanies,
    monthlyPayslips,
    monthlyStaff
  ] = await Promise.all([
    // Total payslips generated (all time)
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds }
      }
    }),
    
    // Total staff accounts (active only)
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        isActive: true
      }
    }),
    
    // HR users (from UserCompany table)
    prisma.userCompany.count({
      where: {
        companyId: { in: companyIds },
        role: 'HR'
      }
    }),
    
    // ADMIN users (from UserCompany table)
    prisma.userCompany.count({
      where: {
        companyId: { in: companyIds },
        role: 'ADMIN'
      }
    }),
    
    // SUPER_ADMIN users
    prisma.userCompany.count({
      where: {
        companyId: { in: companyIds },
        role: 'SUPER_ADMIN'
      }
    }),
    
    // Companies onboarded (non-archived)
    prisma.company.count({
      where: {
        id: { in: companyIds }
      }
    }),
    
    // Monthly payslips
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString()
      }
    }),
    
    // Monthly new staff
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        createdAt: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1)
        }
      }
    })
  ])

  return {
    payslipsGenerated: totalPayslips,
    staffAccounts: totalStaff,
    hrUsers: totalHRUsers,
    adminUsers: totalAdminUsers,
    superAdmins: totalSuperAdmins,
    companiesOnboarded: totalCompanies,
    // Additional metrics
    monthlyPayslips,
    monthlyNewStaff: monthlyStaff,
    averageStaffPerCompany: companyIds.length > 0 ? Math.round(totalStaff / companyIds.length) : 0
  }
}

// ADMIN Statistics
async function getAdminStats(userId: string, companyIds: string[], year: number, month: number) {
  const [
    myCompanies,
    totalStaff,
    totalPayslips,
    totalHRManagers,
    recentPayslips,
    pendingPayrolls
  ] = await Promise.all([
    // My companies count
    prisma.userCompany.count({
      where: {
        userId: userId,
        role: { in: ['ADMIN', 'ALL'] }
      }
    }),
    
    // Total staff in accessible companies
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        role: { not: 'HR' } // Exclude HR from staff count
      }
    }),
    
    // Total payslips (all time)
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds }
      }
    }),
    
    // HR managers in accessible companies
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        role: 'HR',
        isActive: true
      }
    }),
    
    // Recent payslips (last 30 days)
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    }),
    
    // Pending payrolls (not processed)
    prisma.payroll.count({
      where: {
        companyId: { in: companyIds },
        status: 'PENDING',
        year: year,
        month: month.toString()
      }
    })
  ])

  return {
    myCompanies,
    totalStaff,
    payslips: totalPayslips,
    hrManagers: totalHRManagers,
    recentPayslips,
    pendingPayrolls,
    // Additional metrics
    averageStaffPerCompany: companyIds.length > 0 ? Math.round(totalStaff / companyIds.length) : 0
  }
}

// HR Statistics
async function getHRStats(userId: string, companyIds: string[], year: number, month: number) {
  const currentDate = new Date()
  const currentMonthStart = new Date(year, month - 1, 1)
  const currentMonthEnd = new Date(year, month, 0)
  
  const [
    totalStaff,
    pendingPayslips,
    processedPayrolls,
    leaveRequests,
    attendanceRate,
    onboardingPending
  ] = await Promise.all([
    // Total staff in HR's company
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        role: 'STAFF' // Only count regular staff
      }
    }),
    
    // Pending payslips for current month
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        // Assuming payslips without grossPay/netPay are pending
        OR: [
          { grossPay: null },
          { netPay: null }
        ]
      }
    }),
    
    // Processed payrolls for current month
    prisma.payroll.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        status: 'PROCESSED'
      }
    }),
    
    // Leave requests (pending)
    prisma.leaveRequest.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'PENDING'
      }
    }),
    
    // Calculate attendance rate for current month
    (async () => {
      const totalWorkingDays = await prisma.attendance.count({
        where: {
          staffRecord: {
            companyId: { in: companyIds }
          },
          date: {
            gte: currentMonthStart,
            lte: currentMonthEnd
          }
        }
      })
      
      const presentDays = await prisma.attendance.count({
        where: {
          staffRecord: {
            companyId: { in: companyIds }
          },
          date: {
            gte: currentMonthStart,
            lte: currentMonthEnd
          },
          status: 'PRESENT'
        }
      })
      
      return totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0
    })(),
    
    // Pending onboarding
    prisma.onboarding.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'PENDING'
      }
    })
  ])

  return {
    totalStaff,
    pendingPayslips,
    processedPayrolls,
    leaveRequests,
    attendanceRate: `${attendanceRate}%`,
    onboardingPending,
    // Additional metrics
    processedPercentage: processedPayrolls > 0 ? 
      Math.round((processedPayrolls / (processedPayrolls + pendingPayslips)) * 100) : 0
  }
}

// STAFF Statistics
async function getStaffStats(userId: string, year: number, month: number) {
  // Get staff record for the user
  const staffRecord = await prisma.staffRecord.findFirst({
    where: {
      id: userId,
      isActive: true
    },
    select: {
      id: true,
      staffId: true,
      firstName: true,
      lastName: true
    }
  })

  if (!staffRecord) {
    return {
      latestPayment: null,
      nextPayDate: null,
      leaveBalance: 0,
      pendingLeaves: 0
    }
  }

  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1
  
  const [
    latestPayment,
    nextPayroll,
    leaveBalance,
    pendingLeaves,
    thisMonthPayslip
  ] = await Promise.all([
    // Latest payment (most recent payslip)
    prisma.payslip.findFirst({
      where: {
        staffRecordId: staffRecord.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        month: true,
        year: true,
        grossPay: true,
        netPay: true,
        createdAt: true
      }
    }),
    
    // Next pay date (from next payroll schedule)
    prisma.payroll.findFirst({
      where: {
        staffRecordId: staffRecord.id,
        OR: [
          { year: { gt: currentYear } },
          { 
            AND: [
              { year: currentYear },
              { month: { gt: currentMonth.toString() } }
            ]
          }
        ]
      },
      orderBy: [
        { year: 'asc' },
        { month: 'asc' }
      ],
      select: {
        month: true,
        year: true
      }
    }),
    
    // Leave balance (calculate from leave requests)
    (async () => {
      const usedLeaves = await prisma.leaveRequest.count({
        where: {
          staffRecordId: staffRecord.id,
          status: 'APPROVED',
          startDate: {
            gte: new Date(currentYear, 0, 1)
          }
        }
      })
      
      // Assuming standard 20 days annual leave
      const annualLeaveBalance = 20 - usedLeaves
      return Math.max(0, annualLeaveBalance)
    })(),
    
    // Pending leave requests
    prisma.leaveRequest.count({
      where: {
        staffRecordId: staffRecord.id,
        status: 'PENDING'
      }
    }),
    
    // This month's payslip
    prisma.payslip.findFirst({
      where: {
        staffRecordId: staffRecord.id,
        year: currentYear,
        month: currentMonth.toString()
      },
      select: {
        grossPay: true,
        netPay: true
      }
    })
  ])

  return {
    latestPayment: latestPayment ? {
      month: latestPayment.month,
      year: latestPayment.year,
      amount: latestPayment.netPay,
      date: latestPayment.createdAt
    } : null,
    nextPayDate: nextPayroll ? {
      month: nextPayroll.month,
      year: nextPayroll.year
    } : null,
    leaveBalance,
    pendingLeaves,
    thisMonthPayslip: thisMonthPayslip ? {
      grossPay: thisMonthPayslip.grossPay,
      netPay: thisMonthPayslip.netPay,
      isProcessed: thisMonthPayslip.netPay !== null
    } : null,
    // Additional info
    staffName: `${staffRecord.firstName} ${staffRecord.lastName}`,
    staffId: staffRecord.staffId
  }
}