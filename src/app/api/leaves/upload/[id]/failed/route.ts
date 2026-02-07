// app/api/leaves/balances/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { prisma } from '@/app/lib/prisma'

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get leave balances only
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
    
    // Get leave balances for current year
    const balances = await prisma.staffLeaveBalance.findMany({
      where: {
        staffRecordId: user.userId,
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
      },
      orderBy: {
        leaveType: {
          name: 'asc'
        }
      }
    })

    const formattedBalances = balances.map(balance => ({
      leaveTypeId: balance.leaveTypeId,
      leaveType: {
        id: balance.leaveType.id,
        name: balance.leaveType.name,
        code: balance.leaveType.code,
        color: balance.leaveType.color
      },
      year: balance.year,
      totalDays: balance.totalDays,
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
      carriedOver: balance.carriedOver,
      availableDays: balance.totalDays - balance.usedDays - balance.pendingDays,
      expiresAt: balance.expiresAt
    }))

    const response = NextResponse.json({
      success: true,
      data: {
        balances: formattedBalances,
        summary: {
          totalEntitled: formattedBalances.reduce((sum, b) => sum + b.totalDays, 0),
          totalUsed: formattedBalances.reduce((sum, b) => sum + b.usedDays, 0),
          totalPending: formattedBalances.reduce((sum, b) => sum + b.pendingDays, 0),
          totalAvailable: formattedBalances.reduce((sum, b) => sum + b.availableDays, 0)
        },
        year: currentYear,
        lastUpdated: new Date().toISOString()
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Leave balances fetch error:', error)
    
    const response = NextResponse.json(
      { 
        success: false,
        message: 'Failed to fetch leave balances',
        details: error.message 
      },
      { status: 500 }
    )
    return withCors(response, origin)
  }
}