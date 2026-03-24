/**
 * Overtime API Routes
 * POST /api/engine/overtime - Create an overtime entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as overtimeService from '@/app/lib/payroll-engine/overtime'

// Validation schema - accepts both field name formats
const createOvertimeSchema = z.object({
  // Support both 'payPeriodId' and 'periodId'
  payPeriodId: z.string().min(1).optional(),
  periodId: z.string().min(1).optional(),
  staffId: z.string().min(1),
  // Support both 'overtimeHours' and 'hours'
  overtimeHours: z.coerce.number().positive().optional(),
  hours: z.coerce.number().positive().optional(),
  // Support both 'multiplier' and 'rate'
  multiplier: z.coerce.number().positive().optional(),
  rate: z.coerce.number().positive().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
}).refine(
  (data) => data.payPeriodId || data.periodId,
  { message: 'Either payPeriodId or periodId is required', path: ['payPeriodId'] }
).refine(
  (data) => data.overtimeHours || data.hours,
  { message: 'Either overtimeHours or hours is required', path: ['overtimeHours'] }
)

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'MANAGER'])

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
    const validation = createOvertimeSchema.safeParse(body)

    if (!validation.success) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Validation failed', details: validation.error.format() },
          { status: 400 }
        ),
        origin
      )
    }

    // Normalize field names
    const normalizedData = {
      payPeriodId: validation.data.payPeriodId || validation.data.periodId!,
      staffId: validation.data.staffId,
      overtimeHours: validation.data.overtimeHours || validation.data.hours!,
      multiplier: validation.data.multiplier || validation.data.rate,
      date: validation.data.date,
      description: validation.data.description,
    }

    const entry = await overtimeService.createOvertimeEntry(normalizedData, user.companyId)

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Overtime entry created successfully',
        data: entry,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Create overtime entry error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to create overtime entry' },
        { status: 500 }
      ),
      origin
    )
  }
}
