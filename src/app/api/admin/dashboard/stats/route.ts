// src/app/api/admin/dashboard/stats/route.ts
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
    const month = searchParams.get('month') // Can be null or string
    const companyId = searchParams.get('companyId')

    // Initialize response object
    const response: any = {
      userRole: user.role,
      period: {
        year: parseInt(year),
        month: month ? parseInt(month) : null,
        currentDate: new Date().toISOString().split('T')[0]
      }
    }

    // Get accessible companies based on role
    let accessibleCompanyIds: string[] = []
    let currentMonth = month ? parseInt(month) : new Date().getMonth() + 1
    let currentYear = parseInt(year)
    
    // Company access logic
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

// SUPER_ADMIN Statistics (no changes needed)
async function getSuperAdminStats(companyIds: string[], year: number, month: number) {
  const currentDate = new Date()
  const currentMonthStart = new Date(year, month - 1, 1)
  const currentMonthEnd = new Date(year, month, 0)
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  
  const [
    // Company statistics
    totalCompanies,
    activeCompanies,
    archivedCompanies,
    
    // Staff statistics
    totalStaff,
    activeStaff,
    inactiveStaff,
    newStaffThisMonth,
    
    // Payslip statistics
    totalPayslips,
    payslipsThisMonth,
    recentPayslips,
    
    // User statistics
    totalSuperAdmins,
    totalAdmins,
    totalHRUsers,
    
    // Payroll statistics
    totalPayrolls,
    pendingPayrolls,
    processedPayrolls,
    
    // Financial statistics
    totalGrossPay,
    totalNetPay,
    
    // Upload statistics
    uploadStats
    
  ] = await Promise.all([
    // Company counts
    prisma.company.count(),
    prisma.company.count({ where: { archived: 0 } }),
    prisma.company.count({ where: { archived: 1 } }),
    
    // Staff counts
    prisma.staffRecord.count({ 
      where: { companyId: { in: companyIds } } 
    }),
    prisma.staffRecord.count({ 
      where: { 
        companyId: { in: companyIds },
        isActive: true 
      } 
    }),
    prisma.staffRecord.count({ 
      where: { 
        companyId: { in: companyIds },
        isActive: false 
      } 
    }),
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        createdAt: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      }
    }),
    
    // Payslip counts
    prisma.payslip.count({ 
      where: { companyId: { in: companyIds } } 
    }),
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        createdAt: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      }
    }),
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds },
        createdAt: {
          gte: last30Days
        }
      }
    }),
    
    // User counts
    prisma.userCompany.count({ 
      where: { 
        companyId: { in: companyIds },
        role: 'SUPER_ADMIN' 
      } 
    }),
    prisma.userCompany.count({ 
      where: { 
        companyId: { in: companyIds },
        role: 'ADMIN' 
      } 
    }),
    prisma.userCompany.count({ 
      where: { 
        companyId: { in: companyIds },
        role: 'HR' 
      } 
    }),
    
    // Payroll counts
    prisma.payroll.count({ 
      where: { companyId: { in: companyIds } } 
    }),
    prisma.payroll.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        status: 'PENDING'
      }
    }),
    prisma.payroll.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        status: 'PROCESSED'
      }
    }),
    
    // Financial aggregates
    prisma.payslip.aggregate({
      where: { 
        companyId: { in: companyIds },
        grossPay: { not: null }
      },
      _sum: { grossPay: true }
    }),
    prisma.payslip.aggregate({
      where: { 
        companyId: { in: companyIds },
        netPay: { not: null }
      },
      _sum: { netPay: true }
    }),
    
    // Upload statistics
    prisma.payrollUpload.aggregate({
      where: { companyId: { in: companyIds } },
      _sum: {
        totalRecords: true,
        successful: true,
        failed: true,
      },
      _count: { id: true }
    })
  ])

  // Calculate financial totals
  const totalGross = totalGrossPay._sum.grossPay || 0
  const totalNet = totalNetPay._sum.netPay || 0

  return {
    // Company metrics
    companiesOnboarded: activeCompanies,
    totalCompanies: totalCompanies,
    archivedCompanies: archivedCompanies,
    
    // Staff metrics
    staffAccounts: totalStaff,
    activeStaff: activeStaff,
    inactiveStaff: inactiveStaff,
    newStaffThisMonth: newStaffThisMonth,
    
    // User metrics
    superAdmins: totalSuperAdmins,
    adminUsers: totalAdmins,
    hrUsers: totalHRUsers,
    
    // Payroll metrics
    payslipsGenerated: totalPayslips,
    monthlyPayslips: payslipsThisMonth,
    recentPayslips: recentPayslips,
    
    // Payroll processing
    totalPayrolls: totalPayrolls,
    pendingPayrolls: pendingPayrolls,
    processedPayrolls: processedPayrolls,
    
    // Financial metrics
    totalGrossPay: totalGross,
    totalNetPay: totalNet,
    
    // Upload metrics
    totalUploads: uploadStats._count.id || 0,
    totalRecordsProcessed: uploadStats._sum.totalRecords || 0,
    successfulUploads: uploadStats._sum.successful || 0,
    failedUploads: uploadStats._sum.failed || 0,
    
    // Calculated metrics
    averageStaffPerCompany: companyIds.length > 0 ? Math.round(activeStaff / companyIds.length) : 0,
    payrollCompletionRate: totalPayrolls > 0 ? Math.round((processedPayrolls / totalPayrolls) * 100) : 0,
    uploadSuccessRate: uploadStats._sum.totalRecords ? 
      Math.round(((uploadStats._sum.successful || 0) / (uploadStats._sum.totalRecords || 1)) * 100) : 0
  }
}

// ADMIN Statistics (no changes needed)
async function getAdminStats(userId: string, companyIds: string[], year: number, month: number) {
  const currentMonthStart = new Date(year, month - 1, 1)
  const currentMonthEnd = new Date(year, month, 0)
  const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  
  // First get staff count separately
  const staffCount = await prisma.staffRecord.count({
    where: {
      companyId: { in: companyIds },
      isActive: true,
      role: { not: 'HR' }
    }
  })

  const [
    // Company assignments
    myCompanies,
    
    // More staff statistics
    activeStaff,
    newStaffThisMonth,
    
    // Payslip statistics
    totalPayslips,
    payslipsThisMonth,
    
    // HR statistics
    totalHRManagers,
    activeHRManagers,
    
    // Payroll statistics
    pendingPayrolls,
    processedPayrolls,
    
    // Upload statistics
    uploadStats,
    
    // Leave statistics
    pendingLeaves,
    approvedLeaves,
    
    // Attendance statistics
    attendanceStats
    
  ] = await Promise.all([
    // My companies count
    prisma.userCompany.count({
      where: {
        userId: userId,
        role: { in: ['ADMIN', 'ALL'] },
        company: { archived: 0 }
      }
    }),
    
    // More staff counts
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        isActive: true
      }
    }),
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        isActive: true,
        createdAt: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      }
    }),
    
    // Payslip counts
    prisma.payslip.count({
      where: { companyId: { in: companyIds } }
    }),
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString()
      }
    }),
    
    // HR manager counts
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        role: 'HR'
      }
    }),
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        role: 'HR',
        isActive: true
      }
    }),
    
    // Payroll counts
    prisma.payroll.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        status: 'PENDING'
      }
    }),
    prisma.payroll.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        status: 'PROCESSED'
      }
    }),
    
    // Upload statistics
    prisma.payrollUpload.aggregate({
      where: { companyId: { in: companyIds } },
      _sum: {
        totalRecords: true,
        successful: true,
        failed: true,
      },
      _count: { id: true }
    }),
    
    // Leave statistics
    prisma.leaveRequest.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'PENDING'
      }
    }),
    prisma.leaveRequest.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'APPROVED',
        startDate: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      }
    }),
    
    // Attendance statistics for current month
    (async () => {
      const totalAttendance = await prisma.attendance.count({
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
      
      const presentAttendance = await prisma.attendance.count({
        where: {
          staffRecord: {
            companyId: { in: companyIds }
          },
          date: {
            gte: currentMonthStart,
            lte: currentMonthEnd
          },
          signInTime: { not: null }
        }
      })
      
      return {
        total: totalAttendance,
        present: presentAttendance,
        rate: totalAttendance > 0 ? Math.round((presentAttendance / totalAttendance) * 100) : 0
      }
    })()
  ])

  return {
    // Company metrics
    myCompanies: myCompanies,
    
    // Staff metrics
    totalStaff: staffCount,
    activeStaff: activeStaff,
    newStaffThisMonth: newStaffThisMonth,
    
    // HR metrics
    hrManagers: totalHRManagers,
    activeHRManagers: activeHRManagers,
    
    // Payroll metrics
    payslips: totalPayslips,
    monthlyPayslips: payslipsThisMonth,
    pendingPayrolls: pendingPayrolls,
    processedPayrolls: processedPayrolls,
    
    // Upload metrics
    totalUploads: uploadStats._count.id || 0,
    successfulUploads: uploadStats._sum.successful || 0,
    failedUploads: uploadStats._sum.failed || 0,
    
    // Leave metrics
    pendingLeaves: pendingLeaves,
    approvedLeavesThisMonth: approvedLeaves,
    
    // Attendance metrics
    attendanceRate: `${attendanceStats.rate}%`,
    presentDays: attendanceStats.present,
    totalAttendanceDays: attendanceStats.total,
    
    // Calculated metrics
    averageStaffPerCompany: companyIds.length > 0 ? Math.round(staffCount / companyIds.length) : 0,
    payrollCompletionRate: (pendingPayrolls + processedPayrolls) > 0 ? 
      Math.round((processedPayrolls / (pendingPayrolls + processedPayrolls)) * 100) : 0,
    uploadSuccessRate: uploadStats._sum.totalRecords ? 
      Math.round(((uploadStats._sum.successful || 0) / (uploadStats._sum.totalRecords || 1)) * 100) : 0
  }
}

// HR Statistics - FIXED VERSION with correct enum values
async function getHRStats(userId: string, companyIds: string[], year: number, month: number) {
  const currentDate = new Date()
  const currentMonthStart = new Date(year, month - 1, 1)
  const currentMonthEnd = new Date(year, month, 0)
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
  
  // Get total staff count first
  const totalStaffCount = await prisma.staffRecord.count({
    where: {
      companyId: { in: companyIds },
      isActive: true,
      role: 'STAFF'
    }
  })

  const [
    // More staff statistics
    activeStaff,
    
    // Payroll statistics
    pendingPayslips,
    processedPayrolls,
    
    // Leave statistics
    leaveRequests,
    pendingManagerApprovals,
    pendingHRApprovals,
    approvedLeavesThisMonth,
    
    // Attendance statistics
    attendanceToday,
    attendanceThisMonth,
    lateArrivalsThisMonth,
    
    // Onboarding statistics - Using correct enum values
    onboardingPending,
    onboardingCompleted
    
  ] = await Promise.all([
    // More staff counts
    prisma.staffRecord.count({
      where: {
        companyId: { in: companyIds },
        isActive: true
      }
    }),
    
    // Payroll counts
    prisma.payslip.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        OR: [
          { grossPay: null },
          { netPay: null }
        ]
      }
    }),
    prisma.payroll.count({
      where: {
        companyId: { in: companyIds },
        year: year,
        month: month.toString(),
        status: 'PROCESSED'
      }
    }),
    
    // Leave counts
    prisma.leaveRequest.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'PENDING'
      }
    }),
    prisma.leaveRequest.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'PENDING',
        currentStep: 'MANAGER'
      }
    }),
    prisma.leaveRequest.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'MANAGER_APPROVED',
        currentStep: 'HR'
      }
    }),
    prisma.leaveRequest.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'APPROVED',
        startDate: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      }
    }),
    
    // Attendance counts
    prisma.attendance.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        date: today,
        signInTime: { not: null }
      }
    }),
    prisma.attendance.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        date: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        },
        signInTime: { not: null }
      }
    }),
    prisma.attendance.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        date: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        },
        status: 'LATE'
      }
    }),
    
    // Onboarding counts - Using correct enum values
    prisma.onboarding.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'NOT_STARTED' // Correct enum value from your schema
      }
    }),
    
    // Completed onboarding this month
    prisma.onboarding.count({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        status: 'COMPLETED', // Correct enum value from your schema
        updatedAt: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      }
    })
  ])

  // Get today's attendance details
  const todaysAttendance = await (async () => {
    const attendance = await prisma.attendance.findMany({
      where: {
        staffRecord: {
          companyId: { in: companyIds }
        },
        date: today
      },
      include: {
        staffRecord: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            department: true
          }
        }
      }
    })
    
    return {
      total: attendance.length,
      present: attendance.filter(a => a.signInTime !== null).length,
      absent: totalStaffCount - attendance.filter(a => a.signInTime !== null).length,
      late: attendance.filter(a => a.status === 'LATE').length,
      onLeave: attendance.filter(a => a.status === 'LEAVE').length,
      details: attendance.map(a => ({
        name: `${a.staffRecord.firstName} ${a.staffRecord.lastName}`,
        department: a.staffRecord.department,
        status: a.status || (a.signInTime ? 'PRESENT' : 'ABSENT'),
        signInTime: a.signInTime,
        signOutTime: a.signOutTime
      }))
    }
  })()

  // Calculate rates
  const attendanceRate = totalStaffCount > 0 ? Math.round((attendanceToday / totalStaffCount) * 100) : 0
  const monthlyAttendanceRate = activeStaff > 0 ? Math.round((attendanceThisMonth / (activeStaff * 30)) * 100) : 0
  const processedPercentage = (processedPayrolls + pendingPayslips) > 0 ? 
    Math.round((processedPayrolls / (processedPayrolls + pendingPayslips)) * 100) : 0

  return {
    // Staff metrics
    totalStaff: totalStaffCount,
    activeStaff: activeStaff,
    
    // Payroll metrics
    pendingPayslips: pendingPayslips,
    processedPayrolls: processedPayrolls,
    processedPercentage: `${processedPercentage}%`,
    
    // Leave metrics
    leaveRequests: leaveRequests,
    pendingManagerApprovals: pendingManagerApprovals,
    pendingHRApprovals: pendingHRApprovals,
    approvedLeavesThisMonth: approvedLeavesThisMonth,
    
    // Attendance metrics
    attendanceToday: attendanceToday,
    attendanceThisMonth: attendanceThisMonth,
    attendanceRate: `${attendanceRate}%`,
    monthlyAttendanceRate: `${monthlyAttendanceRate}%`,
    lateArrivalsThisMonth: lateArrivalsThisMonth,
    todaysAttendance: todaysAttendance,
    
    // Onboarding metrics
    onboardingPending: onboardingPending,
    onboardingCompleted: onboardingCompleted,
    
    // Calculated metrics
    staffPresentToday: `${attendanceToday}/${totalStaffCount}`,
    leaveApprovalRate: (pendingManagerApprovals + pendingHRApprovals + approvedLeavesThisMonth) > 0 ?
      Math.round((approvedLeavesThisMonth / (pendingManagerApprovals + pendingHRApprovals + approvedLeavesThisMonth)) * 100) : 0
  }
}

// STAFF Statistics (no changes needed)
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
      lastName: true,
      email: true,
      department: true,
      position: true,
      companyId: true,
      company: {
        select: {
          id: true,
          companyName: true
        }
      }
    }
  })

  if (!staffRecord) {
    return {
      staffInfo: null,
      latestPayment: null,
      nextPayDate: null,
      leaveBalance: 0,
      pendingLeaves: 0,
      attendanceSummary: {},
      thisMonthPayslip: null,
      upcomingLeaves: []
    }
  }

  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonthNum = currentDate.getMonth() + 1
  const currentMonthStart = new Date(currentYear, currentMonthNum - 1, 1)
  const currentMonthEnd = new Date(currentYear, currentMonthNum, 0)
  
  const [
    // Payment information
    latestPayment,
    thisMonthPayslip,
    allTimePayments,
    
    // Payroll schedule
    nextPayroll,
    
    // Leave information
    leaveBalanceInfo,
    pendingLeaves,
    upcomingLeaves,
    usedLeavesThisYear,
    
    // Attendance information
    attendanceThisMonth,
    attendanceSummary,
    lateDaysThisMonth,
    
    // Company information
    companyStats
    
  ] = await Promise.all([
    // Latest payment
    prisma.payslip.findFirst({
      where: {
        staffRecordId: staffRecord.id,
        netPay: { not: null }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        month: true,
        year: true,
        grossPay: true,
        netPay: true,
        createdAt: true,
        fileName: true
      }
    }),
    
    // This month's payslip
    prisma.payslip.findFirst({
      where: {
        staffRecordId: staffRecord.id,
        year: currentYear,
        month: currentMonthNum.toString()
      },
      select: {
        id: true,
        grossPay: true,
        netPay: true,
        createdAt: true,
        fileName: true
      }
    }),
    
    // All payments count and total
    prisma.payslip.aggregate({
      where: {
        staffRecordId: staffRecord.id,
        netPay: { not: null }
      },
      _count: { id: true },
      _sum: { netPay: true }
    }),
    
    // Next payroll
    prisma.payroll.findFirst({
      where: {
        staffRecordId: staffRecord.id,
        OR: [
          { year: { gt: currentYear } },
          { 
            AND: [
              { year: currentYear },
              { month: { gt: currentMonthNum.toString() } }
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
        year: true,
        status: true
      }
    }),
    
    // Leave balance calculation
    (async () => {
      // Get approved leaves this year
      const approvedLeaves = await prisma.leaveRequest.findMany({
        where: {
          staffRecordId: staffRecord.id,
          status: 'APPROVED',
          startDate: {
            gte: new Date(currentYear, 0, 1)
          }
        },
        select: {
          totalDays: true
        }
      })
      
      // Calculate total used days
      const usedDays = approvedLeaves.reduce((sum, leave) => {
        return sum + Number(leave.totalDays || 0)
      }, 0)
      
      // Get leave balance from database if exists
      const balanceRecord = await prisma.staffLeaveBalance.findFirst({
        where: {
          staffRecordId: staffRecord.id,
          year: currentYear,
          leaveType: {
            code: 'AL' // Annual Leave
          }
        }
      })
      
      const totalEntitlement = balanceRecord?.totalDays || 20 // Default 20 days
      const availableBalance = totalEntitlement - usedDays
      
      return {
        totalEntitlement,
        usedDays,
        availableBalance: Math.max(0, availableBalance),
        pendingDays: balanceRecord?.pendingDays || 0
      }
    })(),
    
    // Pending leaves
    prisma.leaveRequest.count({
      where: {
        staffRecordId: staffRecord.id,
        status: 'PENDING'
      }
    }),
    
    // Upcoming approved leaves
    prisma.leaveRequest.findMany({
      where: {
        staffRecordId: staffRecord.id,
        status: 'APPROVED',
        startDate: {
          gte: currentDate
        }
      },
      orderBy: {
        startDate: 'asc'
      },
      take: 3,
      select: {
        id: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        reason: true,
        leaveType: {
          select: {
            name: true,
            code: true
          }
        }
      }
    }),
    
    // Used leaves this year
    prisma.leaveRequest.count({
      where: {
        staffRecordId: staffRecord.id,
        status: 'APPROVED',
        startDate: {
          gte: new Date(currentYear, 0, 1)
        }
      }
    }),
    
    // Attendance this month
    prisma.attendance.count({
      where: {
        staffId: staffRecord.id,
        date: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        },
        signInTime: { not: null }
      }
    }),
    
    // Attendance summary
    (async () => {
      const attendance = await prisma.attendance.findMany({
        where: {
          staffId: staffRecord.id,
          date: {
            gte: new Date(currentYear, 0, 1)
          }
        },
        select: {
          date: true,
          signInTime: true,
          signOutTime: true,
          status: true
        }
      })
      
      return {
        totalDays: attendance.length,
        presentDays: attendance.filter(a => a.signInTime !== null).length,
        absentDays: attendance.filter(a => a.signInTime === null).length,
        lateDays: attendance.filter(a => a.status === 'LATE').length,
        halfDays: attendance.filter(a => a.status === 'HALF_DAY').length,
        attendanceRate: attendance.length > 0 ? 
          Math.round((attendance.filter(a => a.signInTime !== null).length / attendance.length) * 100) : 0
      }
    })(),
    
    // Late days this month
    prisma.attendance.count({
      where: {
        staffId: staffRecord.id,
        date: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        },
        status: 'LATE'
      }
    }),
    
    // Company statistics for context
    prisma.staffRecord.count({
      where: {
        companyId: staffRecord.companyId,
        isActive: true
      }
    })
  ])

  // Format next pay date
  let nextPayDate = null
  if (nextPayroll) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
    nextPayDate = {
      month: monthNames[parseInt(nextPayroll.month) - 1],
      year: nextPayroll.year,
      status: nextPayroll.status
    }
  }

  // Format latest payment
  const formattedLatestPayment = latestPayment ? {
    id: latestPayment.id,
    period: `${latestPayment.month} ${latestPayment.year}`,
    amount: latestPayment.netPay,
    grossAmount: latestPayment.grossPay,
    date: latestPayment.createdAt,
    fileName: latestPayment.fileName
  } : null

  // Format this month's payslip
  const formattedThisMonthPayslip = thisMonthPayslip ? {
    id: thisMonthPayslip.id,
    amount: thisMonthPayslip.netPay,
    grossAmount: thisMonthPayslip.grossPay,
    isProcessed: thisMonthPayslip.netPay !== null,
    date: thisMonthPayslip.createdAt,
    fileName: thisMonthPayslip.fileName
  } : null

  // Format upcoming leaves
  const formattedUpcomingLeaves = upcomingLeaves.map(leave => ({
    id: leave.id,
    type: leave.leaveType?.name || 'Leave',
    code: leave.leaveType?.code || 'LV',
    startDate: leave.startDate,
    endDate: leave.endDate,
    duration: `${leave.totalDays} day(s)`,
    reason: leave.reason
  }))

  return {
    // Staff information
    staffInfo: {
      name: `${staffRecord.firstName} ${staffRecord.lastName}`,
      staffId: staffRecord.staffId,
      email: staffRecord.email,
      department: staffRecord.department,
      position: staffRecord.position,
      company: staffRecord.company.companyName
    },
    
    // Payment information
    latestPayment: formattedLatestPayment,
    thisMonthPayslip: formattedThisMonthPayslip,
    paymentHistory: {
      totalPayments: allTimePayments._count.id,
      totalEarned: allTimePayments._sum.netPay || 0
    },
    
    // Payroll information
    nextPayDate: nextPayDate,
    
    // Leave information
    leaveBalance: leaveBalanceInfo.availableBalance,
    leaveDetails: {
      totalEntitlement: leaveBalanceInfo.totalEntitlement,
      usedDays: leaveBalanceInfo.usedDays,
      pendingDays: leaveBalanceInfo.pendingDays,
      availableBalance: leaveBalanceInfo.availableBalance
    },
    pendingLeaves: pendingLeaves,
    usedLeavesThisYear: usedLeavesThisYear,
    upcomingLeaves: formattedUpcomingLeaves,
    
    // Attendance information
    attendanceThisMonth: attendanceThisMonth,
    attendanceSummary: {
      ...attendanceSummary,
      attendanceRate: `${attendanceSummary.attendanceRate}%`
    },
    lateDaysThisMonth: lateDaysThisMonth,
    
    // Company context
    companyStats: {
      totalStaff: companyStats
    }
  }
}