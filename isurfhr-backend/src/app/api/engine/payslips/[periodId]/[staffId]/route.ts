/**
 * Specific Payslip API Routes
 * GET /api/engine/payslips/[periodId]/[staffId] - Get a specific payslip
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as payrollProcessorService from '@/app/lib/payroll-engine/payroll-processor'

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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'HR', 'STAFF'])

    const { periodId, staffId } = await params

    // Staff can only view their own payslip
    if (user.role === 'STAFF' && user.userId !== staffId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'You can only view your own payslip' },
          { status: 403 }
        ),
        origin
      )
    }

    const payslip = await payrollProcessorService.getPayslip(periodId, staffId)

    return withCors(
      NextResponse.json({
        success: true,
        data: payslip,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get payslip error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Payslip not found' },
        { status: 404 }
      ),
      origin
    )
  }
}
