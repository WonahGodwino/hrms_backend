// src/app/api/engine/tax-filing/monthly/[periodId]/route.ts
// Monthly Tax Filing API - Get summary and generate schedules

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  generateMonthlySchedules,
  getSchedulesForPeriod,
  getStateSummaryForPeriod,
  getMissingEmployeesForPeriod,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/monthly/[periodId]
 * Get monthly filing summary for a period
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { periodId } = await params
    const { searchParams } = new URL(request.url)
    let companyId = searchParams.get('companyId')

    if (authUser.role === 'HR') {
      companyId = authUser.companyId || null
    } else if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required for administrators', 400),
        origin
      )
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Verify period belongs to company
    const period = await prisma.payPeriod.findUnique({
      where: { id: periodId },
    })

    if (!period || period.companyId !== companyId) {
      return withCors(ApiResponse.error('Pay period not found', 404), origin)
    }

    // Get existing schedules
    const schedules = await getSchedulesForPeriod(companyId, periodId)

    // Get state summary (for preview or if schedules don't exist)
    const stateSummary = await getStateSummaryForPeriod(companyId, periodId)

    // Get missing employees
    const missingEmployees = await getMissingEmployeesForPeriod(companyId, periodId)

    // Calculate totals
    const totalEmployees = schedules.length > 0
      ? schedules.reduce((sum, s) => sum + s.totalEmployees, 0)
      : stateSummary.reduce((sum, s) => sum + s.employeeCount, 0)

    const totalTaxAmount = schedules.length > 0
      ? schedules.reduce((sum, s) => sum + Number(s.totalTaxAmount), 0)
      : stateSummary.reduce((sum, s) => sum + s.totalTax, 0)

    return withCors(
      ApiResponse.success({
        period: {
          id: period.id,
          year: period.year,
          month: period.month,
          periodName: period.periodName,
          status: period.status,
        },
        schedules,
        stateSummary,
        missingEmployees,
        summary: {
          totalStates: schedules.length > 0 ? schedules.length : stateSummary.length,
          totalEmployees,
          totalTaxAmount,
          missingEmployeesCount: missingEmployees.length,
          schedulesGenerated: schedules.length > 0,
        },
      }, 'Monthly filing summary retrieved'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

/**
 * POST /api/engine/tax-filing/monthly/[periodId]
 * Generate monthly schedules for all states
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { periodId } = await params
    const body = await request.json().catch(() => ({}))
    let companyId = body.companyId as string | null

    if (authUser.role === 'HR') {
      companyId = authUser.companyId || null
    } else if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required for administrators', 400),
        origin
      )
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Verify period belongs to company
    const period = await prisma.payPeriod.findUnique({
      where: { id: periodId },
    })

    if (!period || period.companyId !== companyId) {
      return withCors(ApiResponse.error('Pay period not found', 404), origin)
    }

    // Check period status - should be REVIEW or APPROVED
    if (!['REVIEW', 'APPROVED', 'PAID'].includes(period.status)) {
      return withCors(
        ApiResponse.error(
          `Cannot generate schedules for period in ${period.status} status. Period must be in REVIEW, APPROVED, or PAID status.`,
          400
        ),
        origin
      )
    }

    // Generate schedules
    const schedules = await generateMonthlySchedules(companyId, periodId)

    // Get missing employees count
    const missingEmployees = await getMissingEmployeesForPeriod(companyId, periodId)

    return withCors(
      ApiResponse.success({
        schedules,
        summary: {
          totalStates: schedules.length,
          totalEmployees: schedules.reduce((sum, s) => sum + s.totalEmployees, 0),
          totalTaxAmount: schedules.reduce((sum, s) => sum + Number(s.totalTaxAmount), 0),
          missingEmployeesCount: missingEmployees.length,
        },
        warning: missingEmployees.length > 0
          ? `${missingEmployees.length} employees are missing tax profiles and were not included`
          : null,
      }, `Generated ${schedules.length} state schedules`),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
