// /src/app/api/leaves/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'

// Import prisma with error handling
let prisma: any

try {
  // Try to import the prisma module
  const prismaModule = require('@/app/lib/prisma')
  prisma = prismaModule.prisma
} catch (error) {
  console.error('Failed to import Prisma module:', error)
  // We'll handle this in the endpoints
}

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get leave summary with statistics
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    // Check if Prisma is initialized, if not try to initialize it
    if (!prisma) {
      try {
        // Try to create a new Prisma client on the fly
        const { PrismaClient } = require('@prisma/client')
        prisma = new PrismaClient({
          datasources: {
            db: {
              url: process.env.DATABASE_URL
            }
          }
        })
      } catch (prismaError) {
        console.error('Failed to initialize Prisma client:', prismaError)
        const response = NextResponse.json(
          { 
            success: false, 
            message: 'Database service unavailable',
            details: process.env.NODE_ENV === 'development' ? String(prismaError) : undefined
          },
          { status: 503 }
        )
        return withCors(response, origin)
      }
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

    const currentYear = new Date().getFullYear()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Get leave summary statistics
    const leaveRequests = await prisma.leaveRequest.findMany({
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

    const balances = await prisma.staffLeaveBalance.findMany({
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

    // Calculate statistics
    const stats = {
      totalRequests: leaveRequests.length,
      approved: leaveRequests.filter((l: any) => 
        l.status === 'APPROVED' || l.status === 'MANAGER_APPROVED' || l.status === 'HR_APPROVED'
      ).length,
      pending: leaveRequests.filter((l: any) => l.status === 'PENDING').length,
      rejected: leaveRequests.filter((l: any) => l.status === 'REJECTED').length,
      cancelled: leaveRequests.filter((l: any) => l.status === 'CANCELLED').length,
      usedDays: balances.reduce((sum: number, b: any) => sum + b.usedDays, 0),
      availableDays: balances.reduce((sum: number, b: any) => 
        sum + (b.totalDays - b.usedDays - b.pendingDays), 0),
      pendingDays: balances.reduce((sum: number, b: any) => sum + b.pendingDays, 0)
    }

    // Get current pending requests
    const currentPendingRequests = await prisma.leaveRequest.findMany({
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

    // Get upcoming approved leaves (next 30 days)
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    // Get upcoming leaves - using select for specific fields
    const upcomingLeaves = await prisma.leaveRequest.findMany({
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
      select: {
        id: true,
        leaveType: {
          select: {
            name: true,
            color: true
          }
        },
        startDate: true,
        endDate: true,
        totalDays: true
      },
      orderBy: {
        startDate: 'asc'
      }
    })

    const response = NextResponse.json({
      success: true,
      message: 'Leave summary retrieved successfully',
      data: {
        stats,
        currentYear,
        pendingRequests: currentPendingRequests.map((req: any) => ({
          id: req.id,
          leaveType: req.leaveType.name,
          startDate: req.startDate,
          endDate: req.endDate,
          totalDays: req.totalDays,
          status: req.status,
          currentStep: req.currentStep,
          daysUntil: Math.ceil((new Date(req.startDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        })),
        upcomingLeaves: upcomingLeaves.map((leave: any) => ({
          id: leave.id,
          leaveType: leave.leaveType.name,
          color: leave.leaveType.color,
          startDate: leave.startDate,
          endDate: leave.endDate,
          totalDays: leave.totalDays,
          daysUntil: Math.ceil((new Date(leave.startDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        })),
        summary: {
          hasPendingRequests: currentPendingRequests.length > 0,
          hasUpcomingLeaves: upcomingLeaves.length > 0,
          totalUpcomingDays: upcomingLeaves.reduce((sum: number, leave: any) => sum + leave.totalDays, 0),
          nextLeaveDate: upcomingLeaves.length > 0 ? upcomingLeaves[0].startDate : null
        },
        lastUpdated: new Date().toISOString()
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Leave summary fetch error:', error)
    
    // Handle specific error types
    let statusCode = 500
    let errorMessage = 'Failed to fetch leave summary'
    
    if (error.message?.includes('Authorization') || error.message?.includes('Unauthorized')) {
      statusCode = 401
      errorMessage = 'Authentication failed'
    } else if (error.message?.includes('Prisma') || error.message?.includes('Database')) {
      statusCode = 503
      errorMessage = 'Database service unavailable'
    } else if (error.message?.includes('not found')) {
      statusCode = 404
      errorMessage = 'Leave data not found'
    }
    
    const response = NextResponse.json(
      { 
        success: false,
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: statusCode }
    )
    return withCors(response, origin)
  }
}

// POST - Get filtered leave summary by date range
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    // Check if Prisma is initialized
    if (!prisma) {
      try {
        const { PrismaClient } = require('@prisma/client')
        prisma = new PrismaClient({
          datasources: {
            db: {
              url: process.env.DATABASE_URL
            }
          }
        })
      } catch (prismaError) {
        console.error('Failed to initialize Prisma client:', prismaError)
        const response = NextResponse.json(
          { 
            success: false, 
            message: 'Database service unavailable',
            details: process.env.NODE_ENV === 'development' ? String(prismaError) : undefined
          },
          { status: 503 }
        )
        return withCors(response, origin)
      }
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
      select: {
        id: true,
        leaveType: {
          select: {
            name: true,
            color: true
          }
        },
        startDate: true,
        endDate: true,
        totalDays: true,
        status: true,
        currentStep: true,
        reason: true
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
      select: {
        leaveType: {
          select: {
            name: true,
            color: true
          }
        },
        year: true,
        totalDays: true,
        usedDays: true,
        pendingDays: true
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