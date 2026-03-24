/**
 * Close Validation Window API
 * POST /api/engine/pay-periods/[id]/close-validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as payPeriodService from '@/app/lib/payroll-engine/pay-period'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(
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
    const period = await payPeriodService.closeValidationWindow(id)

    return withCors(
      NextResponse.json({
        success: true,
        message: 'Validation window closed successfully',
        data: period,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Close validation window error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to close validation window' },
        { status: 500 }
      ),
      origin
    )
  }
}
