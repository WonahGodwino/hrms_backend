/**
 * Pay Periods API Routes
 * POST /api/engine/pay-periods - Create a new payroll period
 * GET /api/engine/pay-periods - Get all payroll periods
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as payPeriodService from '@/app/lib/payroll-engine/pay-period'

// Validation schema - supports both formats:
// Format 1: { year, month } - system calculates dates
// Format 2: { name, startDate, endDate, paymentDate } - frontend provides dates
const createPayPeriodSchema = z.object({
  // Format 1 fields
  year: z.coerce.number().min(2020).max(2100).optional(),
  month: z.coerce.number().min(1).max(12).optional(),
  standardMonthlyHours: z.coerce.number().min(1).optional(),
  // Format 2 fields
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  paymentDate: z.string().optional(),
}).refine(
  (data) => (data.year && data.month) || (data.startDate && data.endDate),
  { message: 'Either (year + month) or (startDate + endDate) is required' }
)

const querySchema = z.object({
  year: z.coerce.number().optional(),
  status: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(10),
})

function getErrorStatus(message: string): number {
  if (message.includes('Authentication required') || message.includes('Invalid or expired token')) return 401
  if (message.includes('Insufficient permissions')) return 403
  if (message.includes('not associated with a company') || message.includes('Validation failed')) return 400
  return 500
}

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// POST - Create a new payroll period
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Authorization header missing' },
          { status: 401 }
        ),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRoleAsync(token, ['SUPER_ADMIN', 'ADMIN', 'HR'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    const body = await request.json()
    const validation = createPayPeriodSchema.safeParse(body)

    if (!validation.success) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Validation failed', details: validation.error.format() },
          { status: 400 }
        ),
        origin
      )
    }

    // Handle both payload formats
    let createData: { year: number; month: number; standardMonthlyHours?: number }

    if (validation.data.year && validation.data.month) {
      // Format 1: year + month provided
      createData = {
        year: validation.data.year,
        month: validation.data.month,
        standardMonthlyHours: validation.data.standardMonthlyHours,
      }
    } else if (validation.data.startDate && validation.data.endDate) {
      // Format 2: dates provided - extract year/month from endDate (the payroll month)
      const endDate = new Date(validation.data.endDate)
      createData = {
        year: endDate.getFullYear(),
        month: endDate.getMonth() + 1, // getMonth() is 0-indexed
        standardMonthlyHours: validation.data.standardMonthlyHours,
      }
    } else {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Either (year + month) or (startDate + endDate) is required' },
          { status: 400 }
        ),
        origin
      )
    }

    const period = await payPeriodService.createPayPeriod(
      createData,
      user.companyId,
      user.userId
    )

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Payroll period created successfully',
        data: period,
      }),
      origin
    )
  } catch (error: any) {
    const message = error?.message || String(error)
    console.error('Create pay period error:', message)
    return withCors(
      NextResponse.json(
        { success: false, message: message || 'Failed to create payroll period' },
        { status: getErrorStatus(message) }
      ),
      origin
    )
  }
}

// GET - Get all payroll periods
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Authorization header missing' },
          { status: 401 }
        ),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await requireRoleAsync(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    const { searchParams } = new URL(request.url)
    const query = querySchema.parse({
      year: searchParams.get('year') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })

    const result = await payPeriodService.getPayPeriods(user.companyId, query)

    return withCors(
      NextResponse.json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      }),
      origin
    )
  } catch (error: any) {
    const message = error?.message || String(error)
    console.error('Get pay periods error:', message)
    return withCors(
      NextResponse.json(
        { success: false, message: message || 'Failed to fetch payroll periods' },
        { status: getErrorStatus(message) }
      ),
      origin
    )
  }
}
