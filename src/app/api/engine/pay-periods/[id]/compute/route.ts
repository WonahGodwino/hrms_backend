/**
 * Compute Payroll API
 * POST /api/engine/pay-periods/[id]/compute
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import { z } from 'zod'
import * as payrollProcessorService from '@/app/lib/payroll-engine/payroll-processor'

const computePayrollSchema = z.object({
  nhisApplicable: z.boolean().optional().default(false),
})

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
    const body = await request.json().catch(() => ({}))
    const validation = computePayrollSchema.safeParse(body)

    const options = validation.success ? validation.data : {}

    const result = await payrollProcessorService.computePayroll(
      id,
      user.companyId,
      options
    )

    return withCors(
      NextResponse.json({
        success: true,
        message: `Payroll computed successfully. ${result.processed} payslips processed.`,
        data: result,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Compute payroll error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to compute payroll' },
        { status: 500 }
      ),
      origin
    )
  }
}
