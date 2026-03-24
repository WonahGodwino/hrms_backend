/**
 * Validations by Period API Routes
 * GET /api/engine/validations/[periodId]/summary - Get validation summary
 * GET /api/engine/validations/[periodId]/pending - Get pending validations
 * GET /api/engine/validations/[periodId]/withheld - Get withheld staff
 * GET /api/engine/validations/[periodId]/my-team - Get team for validation
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { withCors, handleCorsOptions } from '@/app/lib/cors'
import * as validationPortalService from '@/app/lib/payroll-engine/validation-portal'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const origin = request.headers.get('origin')
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'summary'

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

    const { periodId } = await params

    let data: any

    switch (type) {
      case 'summary':
        data = await validationPortalService.getValidationSummary(periodId, user.companyId)
        break
      case 'pending':
        data = await validationPortalService.getPendingValidations(periodId, user.companyId)
        break
      case 'withheld':
        data = await validationPortalService.getWithheldStaff(periodId, user.companyId)
        break
      case 'my-team':
        data = await validationPortalService.getTeamForValidation(
          periodId,
          user.userId,
          user.companyId
        )
        break
      default:
        return withCors(
          NextResponse.json(
            { success: false, message: 'Invalid type parameter' },
            { status: 400 }
          ),
          origin
        )
    }

    return withCors(
      NextResponse.json({
        success: true,
        data,
      }),
      origin
    )
  } catch (error: any) {
    console.error('Get validations error:', error?.message || String(error))
    return withCors(
      NextResponse.json(
        { success: false, message: error.message || 'Failed to fetch validations' },
        { status: 500 }
      ),
      origin
    )
  }
}
