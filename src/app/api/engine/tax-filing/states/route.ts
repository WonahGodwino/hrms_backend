// src/app/api/engine/tax-filing/states/route.ts
// States Overview API - List states with employee counts

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  getEmployeeCountByState,
  getAllStates,
  getAllStateNames,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/states
 * List all states with employee counts
 *
 * Query params:
 * - companyId: string (required for admins)
 * - includeEmpty: boolean (include states with 0 employees)
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
    const includeEmpty = searchParams.get('includeEmpty') === 'true'

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

    // Get employee counts by state
    const statesWithEmployees = await getEmployeeCountByState(companyId)

    // Get total employees with profiles
    const totalWithProfiles = statesWithEmployees.reduce((sum, s) => sum + s.count, 0)

    // Get total active employees
    const totalEmployees = await prisma.staffRecord.count({
      where: {
        companyId,
        isActive: true,
      },
    })

    const employeesWithoutProfile = totalEmployees - totalWithProfiles

    let result

    if (includeEmpty) {
      // Include all states, with 0 for those without employees
      const allStates = getAllStates()
      const stateMap = new Map(statesWithEmployees.map(s => [s.state, s]))

      result = allStates.map(stateConfig => {
        const existing = stateMap.get(stateConfig.name)
        return {
          state: stateConfig.name,
          stateCode: stateConfig.code,
          irsName: stateConfig.irsName,
          count: existing?.count || 0,
        }
      }).sort((a, b) => a.state.localeCompare(b.state))
    } else {
      // Only include states with employees
      result = statesWithEmployees
    }

    return withCors(
      ApiResponse.success({
        states: result,
        summary: {
          totalStates: result.filter(s => s.count > 0).length,
          totalEmployeesWithProfile: totalWithProfiles,
          totalEmployeesWithoutProfile: employeesWithoutProfile,
          totalEmployees,
        },
      }, 'States retrieved successfully'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}