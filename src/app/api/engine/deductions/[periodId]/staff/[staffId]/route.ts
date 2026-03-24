/**
 * Deductions Staff API Routes
 * GET /api/engine/deductions/[periodId]/staff/[staffId] - Get staff deductions
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as deductionsService from '@/app/lib/payroll-engine/deductions'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string; staffId: string }> }
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

    const { periodId, staffId } = await params
    const result = await deductionsService.getStaffDeductions(periodId, staffId)

    return withCors(
      NextResponse.json({
        success: true,
        data: result,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get staff deductions error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch staff deductions' },
        { status: 500 }
      ),
      origin
    )
  }
}
