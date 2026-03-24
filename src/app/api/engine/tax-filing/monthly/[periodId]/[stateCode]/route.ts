// src/app/api/engine/tax-filing/monthly/[periodId]/[stateCode]/route.ts
// State-specific Monthly Filing API

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  buildMonthlyScheduleData,
  markScheduleFiled,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/monthly/[periodId]/[stateCode]
 * Get detailed schedule for a specific state
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string; stateCode: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { periodId, stateCode } = await params
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

    // Get schedule data
    const scheduleData = await buildMonthlyScheduleData(
      companyId,
      periodId,
      stateCode.toUpperCase()
    )

    if (!scheduleData) {
      return withCors(
        ApiResponse.error(`No employees found for state ${stateCode} in this period`, 404),
        origin
      )
    }

    // Get filing status
    const schedule = await prisma.taxFilingSchedule.findFirst({
      where: {
        companyId,
        payPeriodId: periodId,
        stateCode: stateCode.toUpperCase(),
      },
    })

    return withCors(
      ApiResponse.success({
        scheduleData,
        filingStatus: schedule ? {
          status: schedule.status,
          filedAt: schedule.filedAt,
          filedBy: schedule.filedBy,
          paymentReference: schedule.paymentReference,
        } : null,
      }, 'State schedule retrieved'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

/**
 * PUT /api/engine/tax-filing/monthly/[periodId]/[stateCode]
 * Mark schedule as filed
 *
 * Body:
 * - paymentReference: string (optional)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string; stateCode: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { periodId, stateCode } = await params
    const body = await request.json()
    const { paymentReference, companyId: bodyCompanyId } = body

    let companyId: string | null = null

    if (authUser.role === 'HR') {
      companyId = authUser.companyId || null
    } else {
      if (!bodyCompanyId) {
        return withCors(
          ApiResponse.error('Company ID is required for administrators', 400),
          origin
        )
      }
      companyId = bodyCompanyId
    }

    if (!companyId) {
      return withCors(
        ApiResponse.error('Company ID is required', 400),
        origin
      )
    }

    // Mark as filed
    const schedule = await markScheduleFiled(
      companyId,
      periodId,
      stateCode.toUpperCase(),
      authUser.userId,
      paymentReference
    )

    return withCors(
      ApiResponse.success(schedule, 'Schedule marked as filed'),
      origin
    )
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return withCors(ApiResponse.error(error.message, 404), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}