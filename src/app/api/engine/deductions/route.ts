/**
 * Deductions API Routes
 * POST /api/engine/deductions - Create a deduction entry
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as deductionsService from '@/app/lib/payroll-engine/deductions'

// Validation schema
const createDeductionSchema = z.object({
  payPeriodId: z.string().min(1),
  staffId: z.string().min(1),
  deductionType: z.enum(['UNION_DUES', 'COOPERATIVE', 'LOAN', 'SALARY_ADVANCE', 'OTHER']),
  amount: z.number().positive(),
  description: z.string().optional(),
})

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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN'])

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

    // Support alternative field names for flexibility
    if (body.type && !body.deductionType) {
      body.deductionType = body.type
      delete body.type
    }
    if (body.periodId && !body.payPeriodId) {
      body.payPeriodId = body.periodId
      delete body.periodId
    }

    const validation = createDeductionSchema.safeParse(body)

    if (!validation.success) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'Validation failed', details: validation.error.format() },
          { status: 400 }
        ),
        origin
      )
    }

    const entry = await deductionsService.createDeductionEntry(validation.data, user.companyId)

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Deduction entry created successfully',
        data: entry,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Create deduction entry error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to create deduction entry' },
        { status: 500 }
      ),
      origin
    )
  }
}
