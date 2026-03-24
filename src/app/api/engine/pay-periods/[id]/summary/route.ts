/**
 * Payroll Summary API
 * GET /api/engine/pay-periods/[id]/summary
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

    const { id } = await params

    const summary = await payrollProcessorService.getPayrollSummary(id, user.companyId)

    return withCors(
      NextResponse.json({
        success: true,
        data: summary,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get payroll summary error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch payroll summary' },
        { status: 500 }
      ),
      origin
    )
  }
}
