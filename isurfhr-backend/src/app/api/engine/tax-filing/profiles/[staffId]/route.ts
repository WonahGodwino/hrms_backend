// src/app/api/engine/tax-filing/profiles/[staffId]/route.ts
// Single Tax Profile Management API - Get, Update, Delete

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'
import {
  getTaxProfile,
  updateTaxProfile,
  deleteTaxProfile,
} from '@/app/lib/payroll-engine/tax-filing'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/profiles/[staffId]
 * Get a single tax profile by staff ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'STAFF'])

    const { staffId } = await params
    const { searchParams } = new URL(request.url)
    let companyId = searchParams.get('companyId')

    // Staff can only view their own profile
    if (authUser.role === 'STAFF') {
      if (staffId !== authUser.userId) {
        return withCors(ApiResponse.error('Unauthorized to view this profile', 403), origin)
      }
      companyId = authUser.companyId || null
    } else if (authUser.role === 'HR') {
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

    const profile = await getTaxProfile(staffId, companyId)

    if (!profile) {
      return withCors(
        ApiResponse.error('Tax profile not found', 404),
        origin
      )
    }

    return withCors(
      ApiResponse.success(profile, 'Tax profile retrieved successfully'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

/**
 * PUT /api/engine/tax-filing/profiles/[staffId]
 * Update a tax profile
 *
 * Body (all optional):
 * - stateOfResidence: string
 * - jtbTin: string
 * - pfaName: string
 * - tinVerified: boolean
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { staffId } = await params
    const body = await request.json()
    const { stateOfResidence, jtbTin, pfaName, tinVerified, companyId: bodyCompanyId } = body

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

    const profile = await updateTaxProfile(staffId, companyId, {
      stateOfResidence,
      jtbTin,
      pfaName,
      tinVerified,
    })

    return withCors(
      ApiResponse.success(profile, 'Tax profile updated successfully'),
      origin
    )
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return withCors(ApiResponse.error(error.message, 404), origin)
    }
    if (error.message?.includes('Cannot change') || error.message?.includes('Invalid')) {
      return withCors(ApiResponse.error(error.message, 400), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}

/**
 * DELETE /api/engine/tax-filing/profiles/[staffId]
 * Delete a tax profile
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const authUser = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const { staffId } = await params
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

    await deleteTaxProfile(staffId, companyId)

    return withCors(
      ApiResponse.success(null, 'Tax profile deleted successfully'),
      origin
    )
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return withCors(ApiResponse.error(error.message, 404), origin)
    }
    return withCors(handleApiError(error), origin)
  }
}
