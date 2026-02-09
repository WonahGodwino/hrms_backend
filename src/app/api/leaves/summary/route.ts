// /src/app/api/leaves/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'

// Import prisma safely
let prisma: any

try {
  const prismaModule = require('@/app/lib/prisma')
  prisma = prismaModule.prisma
} catch (error) {
  console.error('Failed to import Prisma:', error)
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
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

    const currentYear = new Date().getFullYear()
    
    // Get leave summary statistics
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        staffRecordId: user.userId,
        status: {
          in: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']
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

    const stats = {
      totalRequests: leaveRequests.length,
      approved: leaveRequests.filter(l => l.status === 'APPROVED').length,
      pending: leaveRequests.filter(l => l.status === 'PENDING').length,
      rejected: leaveRequests.filter(l => l.status === 'REJECTED').length,
      cancelled: leaveRequests.filter(l => l.status === 'CANCELLED').length,
      usedDays: balances.reduce((sum: number, b: any) => sum + b.usedDays, 0),
      availableDays: balances.reduce((sum: number, b: any) => sum + (b.totalDays - b.usedDays - b.pendingDays), 0),
      pendingDays: balances.reduce((sum: number, b: any) => sum + b.pendingDays, 0)
    }

    const response = NextResponse.json({
      success: true,
      data: {
        stats,
        year: currentYear,
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