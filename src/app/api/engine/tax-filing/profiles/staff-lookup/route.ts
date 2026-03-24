// src/app/api/engine/tax-filing/profiles/staff-lookup/route.ts
// Staff Lookup for Tax Profile Creation - integrates with /api/engine/staff

import { NextRequest } from 'next/server'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { prisma } from '@/app/lib/db'

// CORS preflight
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

/**
 * GET /api/engine/tax-filing/profiles/staff-lookup
 * Get list of staff for tax profile assignment
 *
 * This endpoint provides staff data formatted for dropdown selection
 * when creating/updating tax profiles. It shows which staff already
 * have tax profiles assigned.
 *
 * Query params:
 * - search: Search by name, staffId, or email
 * - withoutProfile: If 'true', only return staff without tax profiles
 * - limit: Max results (default: 500)
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

    // Get company ID
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

    const search = searchParams.get('search') || ''
    const withoutProfile = searchParams.get('withoutProfile') === 'true'
    const limit = parseInt(searchParams.get('limit') || '500', 10)

    // Build where clause
    const where: any = {
      companyId,
      isActive: true,
    }

    // Filter to only staff without tax profiles if requested
    if (withoutProfile) {
      where.taxProfile = null
    }

    // Add search filter
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { staffId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get staff with tax profile status
    const staff = await prisma.staffRecord.findMany({
      where,
      select: {
        id: true,
        staffId: true,
        firstName: true,
        lastName: true,
        email: true,
        department: true,
        position: true,
        taxProfile: {
          select: {
            id: true,
            stateOfResidence: true,
            jtbTin: true,
          },
        },
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
      take: limit,
    })

    // Format response for dropdown/selection
    const formattedStaff = staff.map(s => ({
      // Primary identifier (UUID) - use this for creating tax profiles
      id: s.id,
      // Employee ID (human-readable) - displayed to user
      staffId: s.staffId,
      // Full name for display
      fullName: `${s.firstName} ${s.lastName}`,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      department: s.department,
      position: s.position,
      // Tax profile status
      hasTaxProfile: !!s.taxProfile,
      taxProfile: s.taxProfile ? {
        id: s.taxProfile.id,
        stateOfResidence: s.taxProfile.stateOfResidence,
        hasJtbTin: !!s.taxProfile.jtbTin,
      } : null,
      // Display label for dropdown
      label: `${s.staffId} - ${s.firstName} ${s.lastName}`,
      // Value for dropdown (use id for API calls)
      value: s.id,
    }))

    // Calculate summary stats
    const withProfile = formattedStaff.filter(s => s.hasTaxProfile).length
    const withoutProfileCount = formattedStaff.filter(s => !s.hasTaxProfile).length

    return withCors(
      ApiResponse.success({
        staff: formattedStaff,
        summary: {
          total: formattedStaff.length,
          withTaxProfile: withProfile,
          withoutTaxProfile: withoutProfileCount,
        },
      }, 'Staff list retrieved successfully'),
      origin
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}