// src/app/api/engine/tax-filing/profiles/lock-states/route.ts
// Lock States for January 1st Rule (PITA Compliance)

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import { lockStatesForYear, areStatesLocked } from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/profiles/lock-states
 * Check if states are locked for a company
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

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

    const locked = await areStatesLocked(companyId)

    // Get lock details
    const lockedProfiles = await prisma.employeeTaxProfile.findMany({
      where: {
        companyId,
        lockedState: { not: null },
      },
      select: {
        lockedDate: true,
      },
      take: 1,
    })

    const lockDate = lockedProfiles[0]?.lockedDate || null

    return withCors(
      ApiResponse.success({
        locked,
        lockDate,
        message: locked
          ? `States were locked on ${lockDate?.toISOString().split('T')[0]}`
          : 'States are not locked yet',
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

/**
 * POST /api/engine/tax-filing/profiles/lock-states
 * Lock states for a specific year (January 1st rule)
 *
 * Body:
 * - year: number (required)
 * - companyId: string (required for admins)
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const body = await request.json()
    const { year, companyId: bodyCompanyId } = body

    if (!year || typeof year !== 'number') {
      return withCors(ApiResponse.error('Year is required and must be a number', 400), origin)
    }

    // Validate year is reasonable
    const currentYear = new Date().getFullYear()
    if (year < 2020 || year > currentYear + 1) {
      return withCors(
        ApiResponse.error(`Year must be between 2020 and ${currentYear + 1}`, 400),
        origin
      )
    }

    // Determine company ID
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

    // Validate admin has access
    if (authUser.role === 'ADMIN') {
      const hasAccess = await prisma.userCompany.findFirst({
        where: {
          userId: authUser.userId,
          companyId,
          role: { in: ['ADMIN', 'ALL'] },
        },
      })

      if (!hasAccess) {
        return withCors(
          ApiResponse.error('You do not have access to this company', 403),
          origin
        )
      }
    }

    const result = await lockStatesForYear(companyId, year)

    return withCors(
      ApiResponse.success({
        locked: result.locked,
        skipped: result.skipped,
        alreadyLocked: result.alreadyLocked,
        errors: result.errors,
        message: result.locked > 0
          ? `Successfully locked ${result.locked} employee states for ${year}`
          : result.alreadyLocked > 0
            ? `All ${result.alreadyLocked} employee states were already locked`
            : 'No states to lock',
      }),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
