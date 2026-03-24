/**
 * Pay Period by ID API Routes
 * GET /api/engine/pay-periods/[id] - Get a specific payroll period
 * PATCH /api/engine/pay-periods/[id] - Update a payroll period
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as payPeriodService from '@/app/lib/payroll-engine/pay-period'

// Validation schema
const updatePayPeriodSchema = z.object({
  year: z.number().min(2020).max(2100).optional(),
  month: z.number().min(1).max(12).optional(),
  standardMonthlyHours: z.number().min(1).optional(),
})

// OPTIONS - CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// GET - Get a specific payroll period
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'HR', 'MANAGER'])

    const { id } = await params
    const period = await payPeriodService.getPayPeriodById(id)

    return withCors(
      NextResponse.json({
        success: true,
        data: period,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get pay period error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch payroll period' },
        { status: 404 }
      ),
      origin
    )
  }
}

// PATCH - Update a payroll period
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    requireRole(token, ['SUPER_ADMIN', 'ADMIN'])

    const { id } = await params
    const body = await request.json()
    const validation = updatePayPeriodSchema.safeParse(body)

    if (!validation.success) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Validation failed', details: validation.error.format() },
          { status: 400 }
        ),
        origin
      )
    }

    const period = await payPeriodService.updatePayPeriod(id, validation.data)

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Payroll period updated successfully',
        data: period,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Update pay period error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to update payroll period' },
        { status: 500 }
      ),
      origin
    )
  }
}
