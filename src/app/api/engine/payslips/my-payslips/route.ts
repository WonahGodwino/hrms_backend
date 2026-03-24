/**
 * My Payslips API Routes
 * GET /api/engine/payslips/my-payslips - Get own payslip history
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as payrollProcessorService from '@/app/lib/payroll-engine/payroll-processor'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

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
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'HR', 'STAFF'])

    if (!user.companyId) {
      return withCors(
        NextResponse.json(
          { success: false, message: 'User is not associated with a company' },
          { status: 400 }
        ),
        origin
      )
    }

    const payslips = await payrollProcessorService.getStaffPayslipHistory(
      user.userId,
      user.companyId
    )

    return withCors(
      NextResponse.json({
        success: true,
        staffId: user.userId,
        data: payslips,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get my payslips error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch payslips' },
        { status: 500 }
      ),
      origin
    )
  }
}
