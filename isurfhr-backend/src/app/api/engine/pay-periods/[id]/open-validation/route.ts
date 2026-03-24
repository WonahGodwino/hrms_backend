/**
 * Open Validation Window API
 * POST /api/engine/pay-periods/[id]/open-validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as payPeriodService from '@/app/lib/payroll-engine/pay-period'
import * as employeeSalaryService from '@/app/lib/payroll-engine/employee-salary'
import * as validationPortalService from '@/app/lib/payroll-engine/validation-portal'

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

    // Open validation window
    const period = await payPeriodService.openValidationWindow(id)

    // Get all staff with salary structures
    const salaryStructures = await employeeSalaryService.getActiveSalaryStructures(user.companyId)
    const staffIds = salaryStructures.map((s) => s.staffId)

    // Initialize validation records
    const initialized = await validationPortalService.initializeValidations(
      id,
      staffIds,
      user.companyId
    )

    return withCors(
      NextResponse.json({
        success: true,
        data: period,
        message: `Validation window opened. ${initialized} staff members ready for validation.`,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Open validation window error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to open validation window' },
        { status: 500 }
      ),
      origin
    )
  }
}
