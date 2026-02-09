// /src/app/api/leaves/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'

// Import prisma safely
let prisma: any

try {
  const prismaModule = require('@/app/lib/prisma')
  prisma = prismaModule.prisma
  
  if (!prisma) {
    throw new Error('Prisma client not initialized')
  }
} catch (error) {
  console.error('Failed to import Prisma:', error)
}

// ================ TYPE DEFINITIONS ================

interface LeaveRequestSummary {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'MANAGER_APPROVED' | 'HR_APPROVED';
  totalDays: number;
  startDate: Date;
}

interface LeaveBalanceSummary {
  totalDays: number;
  usedDays: number;
  pendingDays: number;
}

interface LeaveStats {
  totalRequests: number;
  approved: number;
  pending: number;
  rejected: number;
  cancelled: number;
  usedDays: number;
  availableDays: number;
  pendingDays: number;
  utilizationRate: number;
}

interface PendingLeaveRequest {
  id: string;
  leaveType: {
    name: string;
  };
  startDate: Date;
  endDate: Date;
  totalDays: number;
  status: string;
  currentStep: string;
}

interface UpcomingLeave {
  id: string;
  leaveType: {
    name: string;
    color: string | null;
  };
  startDate: Date;
  endDate: Date;
  totalDays: number;
  isHalfDay: boolean | null;
  halfDayPart: 'FIRST_HALF' | 'SECOND_HALF' | null;
}

interface FormattedPendingRequest {
  id: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  status: string;
  currentStep: string;
  daysUntil: number;
}

interface FormattedUpcomingLeave {
  id: string;
  leaveType: string;
  color: string | null;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  isHalfDay: boolean | null;
  halfDayPart: 'FIRST_HALF' | 'SECOND_HALF' | null;
  daysUntil: number;
}

interface SummaryData {
  stats: LeaveStats;
  currentYear: number;
  pendingRequests: FormattedPendingRequest[];
  upcomingLeaves: FormattedUpcomingLeave[];
  summary: {
    hasPendingRequests: boolean;
    hasUpcomingLeaves: boolean;
    totalUpcomingDays: number;
    nextLeaveDate: Date | null;
    nextLeaveInDays: number | null;
  };
  lastUpdated: string;
}

// ================ HELPER FUNCTIONS ================

function calculateDaysUntil(targetDate: Date): number {
  const now = new Date();
  const target = new Date(targetDate);
  const diffTime = target.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'APPROVED':
    case 'MANAGER_APPROVED':
    case 'HR_APPROVED':
      return 'green';
    case 'PENDING':
      return 'yellow';
    case 'REJECTED':
      return 'red';
    case 'CANCELLED':
      return 'gray';
    default:
      return 'gray';
  }
}

// ================ API ENDPOINTS ================

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get leave summary with statistics
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    // Check if Prisma is initialized
    if (!prisma) {
      throw new Error('Database connection not initialized')
    }

    // Validate authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json(
        { success: false, message: 'Authorization header missing' },
        { status: 401 }
      )
      return withCors(response, origin)
    }
    
    // Verify user token and role
    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['STAFF', 'HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])

    const currentYear = new Date().getFullYear()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // 1. Get leave summary statistics
    const leaveRequests: LeaveRequestSummary[] = await prisma.leaveRequest.findMany({
      where: {
        staffRecordId: user.userId,
        status: {
          in: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'MANAGER_APPROVED', 'HR_APPROVED']
        }
      },
      select: {
        status: true,
        totalDays: true,
        startDate: true
      }
    })

    // 2. Get leave balances
    const balances: LeaveBalanceSummary[] = await prisma.staffLeaveBalance.findMany({
      where: {
        staffRecordId: user.userId,
        year: currentYear
      },
      select: {
        totalDays: true,
        usedDays: true,
        pendingDays: true
      }
    })

    // 3. Calculate statistics with proper typing
    const approvedRequests = leaveRequests.filter((req: LeaveRequestSummary) => 
      req.status === 'APPROVED' || req.status === 'MANAGER_APPROVED' || req.status === 'HR_APPROVED'
    )
    
    const pendingRequests = leaveRequests.filter((req: LeaveRequestSummary) => req.status === 'PENDING')
    const rejectedRequests = leaveRequests.filter((req: LeaveRequestSummary) => req.status === 'REJECTED')
    const cancelledRequests = leaveRequests.filter((req: LeaveRequestSummary) => req.status === 'CANCELLED')

    const totalUsedDays = balances.reduce((sum: number, balance: LeaveBalanceSummary) => sum + balance.usedDays, 0)
    const totalPendingDays = balances.reduce((sum: number, balance: LeaveBalanceSummary) => sum + balance.pendingDays, 0)
    const totalAvailableDays = balances.reduce((sum: number, balance: LeaveBalanceSummary) => 
      sum + (balance.totalDays - balance.usedDays - balance.pendingDays), 0)
    const totalEntitledDays = balances.reduce((sum: number, balance: LeaveBalanceSummary) => sum + balance.totalDays, 0)

    const stats: LeaveStats = {
      totalRequests: leaveRequests.length,
      approved: approvedRequests.length,
      pending: pendingRequests.length,
      rejected: rejectedRequests.length,
      cancelled: cancelledRequests.length,
      usedDays: totalUsedDays,
      availableDays: totalAvailableDays,
      pendingDays: totalPendingDays,
      utilizationRate: totalEntitledDays > 0 ? Math.round((totalUsedDays / totalEntitledDays) * 100) : 0
    }

    // 4. Get current pending requests for additional context
    const currentPendingRequests: PendingLeaveRequest[] = await prisma.leaveRequest.findMany({
      where: {
        staffRecordId: user.userId,
        status: 'PENDING',
        startDate: {
          gte: today
        }
      },
      include: {
        leaveType: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        startDate: 'asc'
      },
      take: 5
    })

    // 5. Get upcoming approved leaves (next 30 days)
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    const upcomingLeaves: UpcomingLeave[] = await prisma.leaveRequest.findMany({
      where: {
        staffRecordId: user.userId,
        status: {
          in: ['APPROVED', 'MANAGER_APPROVED', 'HR_APPROVED']
        },
        startDate: {
          gte: today,
          lte: thirtyDaysFromNow
        }
      },
      include: {
        leaveType: {
          select: {
            name: true,
            color: true
          }
        }
      },
      orderBy: {
        startDate: 'asc'
      }
    })

    // 6. Format pending requests with proper typing
    const formattedPendingRequests: FormattedPendingRequest[] = currentPendingRequests.map((req: PendingLeaveRequest) => ({
      id: req.id,
      leaveType: req.leaveType.name,
      startDate: req.startDate,
      endDate: req.endDate,
      totalDays: req.totalDays,
      status: req.status,
      currentStep: req.currentStep,
      daysUntil: calculateDaysUntil(req.startDate)
    }))

    // 7. Format upcoming leaves with proper typing
    const formattedUpcomingLeaves: FormattedUpcomingLeave[] = upcomingLeaves.map((leave: UpcomingLeave) => ({
      id: leave.id,
      leaveType: leave.leaveType.name,
      color: leave.leaveType.color,
      startDate: leave.startDate,
      endDate: leave.endDate,
      totalDays: leave.totalDays,
      isHalfDay: leave.isHalfDay,
      halfDayPart: leave.halfDayPart,
      daysUntil: calculateDaysUntil(leave.startDate)
    }))

    // 8. Calculate summary information
    const totalUpcomingDays = formattedUpcomingLeaves.reduce((sum: number, leave: FormattedUpcomingLeave) => 
      sum + leave.totalDays, 0)
    
    const nextLeaveDate = formattedUpcomingLeaves.length > 0 ? formattedUpcomingLeaves[0].startDate : null
    const nextLeaveInDays = nextLeaveDate ? calculateDaysUntil(nextLeaveDate) : null

    const summaryData: SummaryData = {
      stats,
      currentYear,
      pendingRequests: formattedPendingRequests,
      upcomingLeaves: formattedUpcomingLeaves,
      summary: {
        hasPendingRequests: formattedPendingRequests.length > 0,
        hasUpcomingLeaves: formattedUpcomingLeaves.length > 0,
        totalUpcomingDays,
        nextLeaveDate,
        nextLeaveInDays
      },
      lastUpdated: new Date().toISOString()
    }

    // 9. Return successful response
    const response = NextResponse.json({
      success: true,
      message: 'Leave summary retrieved successfully',
      data: summaryData
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Leave summary fetch error:', error)
    
    // Handle different types of errors
    let statusCode = 500
    let errorMessage = 'Failed to fetch leave summary'
    let errorDetails = process.env.NODE_ENV === 'development' ? error.message : undefined

    if (error.message.includes('Authorization') || error.message.includes('token')) {
      statusCode = 401
      errorMessage = 'Authentication failed'
    } else if (error.message.includes('Database connection') || error.message.includes('Prisma')) {
      statusCode = 503
      errorMessage = 'Database service unavailable'
    } else if (error.message.includes('not found') || error.message.includes('No record')) {
      statusCode = 404
      errorMessage = 'Leave data not found'
    }

    const response = NextResponse.json(
      { 
        success: false,
        message: errorMessage,
        details: errorDetails
      },
      { status: statusCode }
    )
    return withCors(response, origin)
  }
}

// Optional: POST method for filtering summary by date range
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    if (!prisma) {
      throw new Error('Database connection not initialized')
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json(
        { success: false, message: 'Authorization header missing' },
        { status: 401 }
      )
      return withCors(response, origin)
    }
    
    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['STAFF', 'HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])

    const body = await request.json()
    const { startDate, endDate, year } = body

    // Validate date parameters
    const filterYear = year || new Date().getFullYear()
    let dateFilter: any = {}

    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD')
      }
      
      dateFilter = {
        startDate: {
          gte: start,
          lte: end
        }
      }
    } else if (year) {
      dateFilter = {
        startDate: {
          gte: new Date(filterYear, 0, 1),
          lte: new Date(filterYear, 11, 31)
        }
      }
    }

    // Get filtered leave requests
    const filteredRequests = await prisma.leaveRequest.findMany({
      where: {
        staffRecordId: user.userId,
        ...dateFilter
      },
      include: {
        leaveType: {
          select: {
            name: true,
            color: true
          }
        }
      },
      orderBy: {
        startDate: 'asc'
      }
    })

    // Get balances for the specified year
    const filteredBalances = await prisma.staffLeaveBalance.findMany({
      where: {
        staffRecordId: user.userId,
        year: filterYear
      },
      include: {
        leaveType: {
          select: {
            name: true,
            color: true
          }
        }
      }
    })

    // Format filtered response
    const formattedRequests = filteredRequests.map((req: any) => ({
      id: req.id,
      leaveType: req.leaveType.name,
      color: req.leaveType.color,
      startDate: req.startDate,
      endDate: req.endDate,
      totalDays: req.totalDays,
      status: req.status,
      currentStep: req.currentStep,
      reason: req.reason?.substring(0, 100) + (req.reason?.length > 100 ? '...' : '')
    }))

    const formattedBalances = filteredBalances.map((balance: any) => ({
      leaveType: balance.leaveType.name,
      year: balance.year,
      totalDays: balance.totalDays,
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
      availableDays: balance.totalDays - balance.usedDays - balance.pendingDays
    }))

    const response = NextResponse.json({
      success: true,
      message: 'Filtered leave summary retrieved successfully',
      data: {
        requests: formattedRequests,
        balances: formattedBalances,
        filter: {
          startDate: startDate || null,
          endDate: endDate || null,
          year: filterYear
        },
        counts: {
          totalRequests: filteredRequests.length,
          approved: filteredRequests.filter((req: any) => 
            req.status === 'APPROVED' || req.status === 'MANAGER_APPROVED' || req.status === 'HR_APPROVED'
          ).length,
          pending: filteredRequests.filter((req: any) => req.status === 'PENDING').length,
          rejected: filteredRequests.filter((req: any) => req.status === 'REJECTED').length,
          cancelled: filteredRequests.filter((req: any) => req.status === 'CANCELLED').length
        },
        lastUpdated: new Date().toISOString()
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Filtered leave summary error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to fetch filtered leave summary',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}