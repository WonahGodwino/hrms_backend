/**
 * Overtime Staff Total API Routes
 * GET /api/engine/overtime/[periodId]/staff/[staffId] - Get staff overtime total
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as overtimeService from '@/app/lib/payroll-engine/overtime'

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

    const { periodId, staffId } = await params
    const result = await overtimeService.getStaffOvertimeTotal(periodId, staffId)

    return withCors(
      NextResponse.json({
        success: true,
        data: result,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get staff overtime total error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch staff overtime total' },
        { status: 500 }
      ),
      origin
    )
  }
}
