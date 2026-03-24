// src/app/api/engine/tax-filing/profiles/route.ts
// Tax Profile Management API - List and Create

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  createTaxProfile,
  listTaxProfiles,
  getEmployeesWithoutTaxProfile,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/profiles
 * List all tax profiles for a company
 *
 * Query params:
 * - stateOfResidence: Filter by state
 * - hasJtbTin: Filter by TIN presence (true/false)
 * - missingProfiles: If true, return employees without profiles
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
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

    // Get company ID from query or user context
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

    // Check if requesting employees without profiles
    const missingProfiles = searchParams.get('missingProfiles') === 'true'

    if (missingProfiles) {
      const employees = await getEmployeesWithoutTaxProfile(companyId)
      return withCors(
        ApiResponse.success({
          employees,
          total: employees.length,
        }, 'Employees without tax profiles retrieved'),
        origin
      )
    }

    // Get query filters
    const stateOfResidence = searchParams.get('stateOfResidence') || undefined
    const hasJtbTinParam = searchParams.get('hasJtbTin')
    const hasJtbTin = hasJtbTinParam === 'true' ? true : hasJtbTinParam === 'false' ? false : undefined
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const { profiles, total } = await listTaxProfiles(companyId, {
      stateOfResidence,
      hasJtbTin,
      page,
      limit,
    })

    return withCors(
      ApiResponse.success({
        profiles,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }, 'Tax profiles retrieved successfully'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

/**
 * POST /api/engine/tax-filing/profiles
 * Create a new tax profile for an employee
 *
 * Body:
 * - staffId: string (required)
 * - stateOfResidence: string (required)
 * - jtbTin: string (optional)
 * - pfaName: string (optional)
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
    const { staffId, stateOfResidence, jtbTin, pfaName, companyId: bodyCompanyId } = body

    // Validate required fields
    if (!staffId) {
      return withCors(ApiResponse.error('Staff ID is required', 400), origin)
    }

    if (!stateOfResidence) {
      return withCors(ApiResponse.error('State of residence is required', 400), origin)
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

    // Validate admin has access to company
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

    // Create the profile
    const profile = await createTaxProfile(companyId, {
      staffId,
      stateOfResidence,
      jtbTin,
      pfaName,
    })

    return withCors(
      ApiResponse.success(profile, 'Tax profile created successfully', 201),
      origin
    )
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      return withCors(ApiResponse.error(error.message, 409), origin)
    }
    if (error.message?.includes('not found') || error.message?.includes('Invalid')) {
      return withCors(ApiResponse.error(error.message, 400), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}
