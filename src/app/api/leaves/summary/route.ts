// /src/app/api/leaves/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { prisma } from '@/app/lib/prisma'

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get leave summary with statistics
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
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
      approved: leaveRequests.filter(l => 
        l.status === 'APPROVED' || l.status === 'MANAGER_APPROVED' || l.status === 'HR_APPROVED'
      ).length,
      pending: leaveRequests.filter(l => l.status === 'PENDING').length,
      rejected: leaveRequests.filter(l => l.status === 'REJECTED').length,
      cancelled: leaveRequests.filter(l => l.status === 'CANCELLED').length,
      usedDays: balances.reduce((sum, b) => sum + b.usedDays, 0),
      availableDays: balances.reduce((sum, b) => sum + (b.totalDays - b.usedDays - b.pendingDays), 0),
      pendingDays: balances.reduce((sum, b) => sum + b.pendingDays, 0)
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

    const response = NextResponse.json({
      success: true,
      message: 'Leave summary retrieved successfully',
      data: {
        stats,
        currentYear,
        pendingRequests: currentPendingRequests.map(req => ({
          id: req.id,
          leaveType: req.leaveType.name,
          startDate: req.startDate,
          endDate: req.endDate,
          totalDays: req.totalDays,
          status: req.status,
          currentStep: req.currentStep,
          daysUntil: Math.ceil((new Date(req.startDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        })),
        upcomingLeaves: upcomingLeaves.map(leave => ({
          id: leave.id,
          leaveType: leave.leaveType.name,
          color: leave.leaveType.color,
          startDate: leave.startDate,
          endDate: leave.endDate,
          totalDays: leave.totalDays,
          isHalfDay: leave.isHalfDay,
          halfDayPart: leave.halfDayPart,
          daysUntil: Math.ceil((new Date(leave.startDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        })),
        summary: {
          hasPendingRequests: currentPendingRequests.length > 0,
          hasUpcomingLeaves: upcomingLeaves.length > 0,
          totalUpcomingDays: upcomingLeaves.reduce((sum, leave) => sum + leave.totalDays, 0),
          nextLeaveDate: upcomingLeaves.length > 0 ? upcomingLeaves[0].startDate : null
        },
        lastUpdated: new Date().toISOString()
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Leave summary fetch error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to fetch leave summary',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}