// src/app/api/leaves/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { prisma } from '@/app/lib/prisma'

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get comprehensive leave summary for authenticated user
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

    // Get staff record
    const staff = await prisma.staffRecord.findUnique({
      where: { 
        id: user.userId,
        isActive: true 
      },
      select: {
        id: true,
        companyId: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        createdAt: true
      }
    })

    if (!staff || !staff.companyId) {
      const response = NextResponse.json(
        { success: false, message: 'Staff record not found or not associated with a company' },
        { status: 404 }
      )
      return withCors(response, origin)
    }

    const currentYear = new Date().getFullYear()
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get all active leave types with their policies
    const leaveTypes = await prisma.leaveType.findMany({
      where: {
        isActive: true,
        policy: {
          companyId: staff.companyId
        }
      },
      include: {
        policy: {
          select: {
            id: true,
            name: true,
            maxDays: true,
            carryOver: true,
            isPaid: true,
            accrualRate: true,
            requiresApproval: true,
            approvalWorkflow: true,
            allowHalfDays: true,
            documentationRequired: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })

    // Get all leave balances for current year
    const leaveBalances = await prisma.staffLeaveBalance.findMany({
      where: {
        staffRecordId: staff.id,
        year: currentYear,
        leaveType: {
          isActive: true
        }
      },
      include: {
        leaveType: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true
          }
        }
      }
    })

    // Get all leave requests for current year (for usage calculation)
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        staffRecordId: staff.id,
        startDate: {
          gte: new Date(`${currentYear}-01-01`),
          lte: new Date(`${currentYear}-12-31`)
        },
        status: {
          in: ['APPROVED', 'MANAGER_APPROVED', 'HR_APPROVED', 'PENDING']
        }
      },
      select: {
        id: true,
        leaveTypeId: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        status: true,
        currentStep: true
      },
      orderBy: {
        startDate: 'desc'
      }
    })

    // Calculate accrued days if accrual rate is set
    const calculateAccruedDays = (policy: any, employmentDate: Date): number => {
      if (!policy.accrualRate || policy.accrualRate <= 0) return 0
      
      const employmentStart = new Date(employmentDate)
      const monthsEmployed = (today.getFullYear() - employmentStart.getFullYear()) * 12 + 
                           (today.getMonth() - employmentStart.getMonth())
      
      return Math.max(0, monthsEmployed * policy.accrualRate)
    }

    // Calculate upcoming leave within next 30 days
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(today.getDate() + 30)
    
    const upcomingLeaves = leaveRequests.filter(request => 
      new Date(request.startDate) >= today && 
      new Date(request.startDate) <= thirtyDaysFromNow &&
      request.status !== 'REJECTED' && 
      request.status !== 'CANCELLED'
    )

    // Calculate total days taken by leave type
    const daysTakenByLeaveType: Record<string, number> = {}
    leaveRequests.forEach(request => {
      if (request.status === 'APPROVED' || request.status === 'HR_APPROVED' || request.status === 'MANAGER_APPROVED') {
        daysTakenByLeaveType[request.leaveTypeId] = 
          (daysTakenByLeaveType[request.leaveTypeId] || 0) + request.totalDays
      }
    })

    // Calculate pending days by leave type
    const pendingDaysByLeaveType: Record<string, number> = {}
    leaveRequests.forEach(request => {
      if (request.status === 'PENDING') {
        pendingDaysByLeaveType[request.leaveTypeId] = 
          (pendingDaysByLeaveType[request.leaveTypeId] || 0) + request.totalDays
      }
    })

    // Build comprehensive response
    const leaveSummary = leaveTypes.map(leaveType => {
      const balance = leaveBalances.find(b => b.leaveTypeId === leaveType.id)
      const daysTaken = daysTakenByLeaveType[leaveType.id] || 0
      const pendingDays = pendingDaysByLeaveType[leaveType.id] || 0
      const accruedDays = calculateAccruedDays(leaveType.policy, staff.createdAt)
      
      // Calculate available balance
      let availableBalance = 0
      if (balance) {
        availableBalance = balance.totalDays - balance.usedDays - balance.pendingDays
      }

      // Get policy details
      const policy = leaveType.policy

      return {
        leaveType: {
          id: leaveType.id,
          name: leaveType.name,
          code: leaveType.code,
          color: leaveType.color,
          description: leaveType.description,
          isActive: leaveType.isActive
        },
        policy: {
          id: policy.id,
          name: policy.name,
          maxDays: policy.maxDays,
          isPaid: policy.isPaid,
          requiresApproval: policy.requiresApproval,
          approvalWorkflow: policy.approvalWorkflow,
          allowHalfDays: policy.allowHalfDays,
          documentationRequired: policy.documentationRequired
        },
        balance: balance ? {
          year: balance.year,
          totalDays: balance.totalDays,
          usedDays: balance.usedDays,
          pendingDays: balance.pendingDays,
          carriedOver: balance.carriedOver,
          expiresAt: balance.expiresAt,
          availableDays: availableBalance
        } : null,
        usage: {
          daysTaken,
          pendingDays,
          accruedDays,
          availableBalance: availableBalance,
          percentageUsed: balance && balance.totalDays > 0 ? 
            Math.round((daysTaken / balance.totalDays) * 100) : 0
        },
        // Current year requests for this leave type
        requests: leaveRequests
          .filter(req => req.leaveTypeId === leaveType.id)
          .map(req => ({
            id: req.id,
            startDate: req.startDate,
            endDate: req.endDate,
            totalDays: req.totalDays,
            status: req.status,
            currentStep: req.currentStep
          }))
          .slice(0, 5) // Limit to 5 most recent requests
      }
    })

    // Calculate overall statistics
    const totalLeaveTypes = leaveTypes.length
    const totalEntitledDays = leaveBalances.reduce((sum, b) => sum + b.totalDays, 0)
    const totalUsedDays = leaveBalances.reduce((sum, b) => sum + b.usedDays, 0)
    const totalPendingDays = leaveBalances.reduce((sum, b) => sum + b.pendingDays, 0)
    const totalAvailableDays = totalEntitledDays - totalUsedDays - totalPendingDays

    // Get company work week pattern
    const company = await prisma.company.findUnique({
      where: { id: staff.companyId },
      select: { 
        workWeekPattern: true,
        companyName: true 
      }
    })

    // Get today's leave requests (if any)
    const todaysLeaves = leaveRequests.filter(request => {
      const startDate = new Date(request.startDate)
      const endDate = new Date(request.endDate)
      return startDate <= today && endDate >= today && 
             (request.status === 'APPROVED' || request.status === 'HR_APPROVED' || request.status === 'MANAGER_APPROVED')
    })

    const response = NextResponse.json({
      success: true,
      data: {
        staff: {
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          department: staff.department,
          position: staff.position,
          employmentStart: staff.createdAt
        },
        company: {
          id: staff.companyId,
          name: company?.companyName,
          workWeekPattern: company?.workWeekPattern
        },
        summary: {
          year: currentYear,
          totalLeaveTypes,
          totalEntitledDays,
          totalUsedDays,
          totalPendingDays,
          totalAvailableDays,
          percentageUsed: totalEntitledDays > 0 ? 
            Math.round((totalUsedDays / totalEntitledDays) * 100) : 0
        },
        leaveTypes: leaveSummary,
        upcomingLeaves: upcomingLeaves.map(leave => ({
          id: leave.id,
          leaveTypeId: leave.leaveTypeId,
          leaveTypeName: leaveTypes.find(lt => lt.id === leave.leaveTypeId)?.name,
          startDate: leave.startDate,
          endDate: leave.endDate,
          totalDays: leave.totalDays,
          status: leave.status,
          daysUntil: Math.ceil((new Date(leave.startDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        })),
        todaysLeaves: todaysLeaves.map(leave => ({
          id: leave.id,
          leaveTypeId: leave.leaveTypeId,
          leaveTypeName: leaveTypes.find(lt => lt.id === leave.leaveTypeId)?.name,
          startDate: leave.startDate,
          endDate: leave.endDate,
          totalDays: leave.totalDays,
          status: leave.status
        })),
        statistics: {
          byStatus: {
            approved: leaveRequests.filter(r => r.status === 'APPROVED').length,
            pending: leaveRequests.filter(r => r.status === 'PENDING').length,
            rejected: leaveRequests.filter(r => r.status === 'REJECTED').length,
            cancelled: leaveRequests.filter(r => r.status === 'CANCELLED').length
          },
          byMonth: (() => {
            const monthCounts: Record<string, number> = {}
            leaveRequests.forEach(request => {
              if (request.status === 'APPROVED' || request.status === 'HR_APPROVED' || request.status === 'MANAGER_APPROVED') {
                const month = new Date(request.startDate).getMonth()
                monthCounts[month] = (monthCounts[month] || 0) + request.totalDays
              }
            })
            return monthCounts
          })()
        }
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        year: currentYear,
        currency: 'days'
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Leave summary fetch error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to fetch leave summary',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}