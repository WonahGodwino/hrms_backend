// /src/app/api/leaves/balances/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'

// Import prisma safely
let prisma: any

try {
  // Dynamic import to ensure Prisma is initialized properly
  const prismaModule = require('@/app/lib/prisma')
  prisma = prismaModule.prisma
  
  if (!prisma) {
    throw new Error('Prisma client not initialized')
  }
} catch (error) {
  console.error('Failed to import Prisma:', error)
}

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get leave balances only
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    // Check if Prisma is initialized
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

    const formattedBalances = balances.map((balance: any) => ({
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
          totalEntitled: formattedBalances.reduce((sum: number, b: any) => sum + b.totalDays, 0),
          totalUsed: formattedBalances.reduce((sum: number, b: any) => sum + b.usedDays, 0),
          totalPending: formattedBalances.reduce((sum: number, b: any) => sum + b.pendingDays, 0),
          totalAvailable: formattedBalances.reduce((sum: number, b: any) => sum + b.availableDays, 0)
        },
        year: currentYear,
        lastUpdated: new Date().toISOString()
      }
    })
    
    return withCors(response, origin)

  } catch (error: any) {
    console.error('Leave balances fetch error:', error)
    
    // Provide more specific error messages
    let statusCode = 500
    let errorMessage = 'Failed to fetch leave balances'
    
    if (error.message.includes('Authorization')) {
      statusCode = 401
      errorMessage = error.message
    } else if (error.message.includes('Database connection')) {
      statusCode = 503
      errorMessage = 'Database service unavailable'
    } else if (error.message.includes('not found')) {
      statusCode = 404
      errorMessage = 'Leave balances not found'
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