// src/app/api/auth/companies/[id]/locations/[locationId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verifyToken, checkCompanyAccess } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { updateCompanyLocation } from '@/app/lib/companies/location-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Builds a spec-shaped constraint-violation body: { success:false, error, message }.
// This intentionally differs from ApiResponse.error (which uses { message, errors }).
function constraintError(error: string, message: string, status = 409) {
  return NextResponse.json({ success: false, error, message }, { status })
}

// PATCH /api/auth/companies/:id/locations/:locationId
// Updates a location (RESTful variant; same logic as PATCH on the collection).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; locationId: string } }
) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return withCors(ApiResponse.error('Authorization token is required', 401), origin)
    }
    const decoded = verifyToken(authHeader.replace('Bearer ', ''))
    if (!decoded) return withCors(ApiResponse.error('Invalid or expired token', 401), origin)
    if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(decoded.role)) {
      return withCors(ApiResponse.error('You do not have permission to manage locations', 403), origin)
    }

    const { id: companyId, locationId } = params
    const hasAccess = await checkCompanyAccess(decoded.userId, companyId, decoded.role)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    const body = await request.json().catch(() => ({}))
    const result = await updateCompanyLocation(companyId, locationId, body)
    if (!result.ok) return withCors(ApiResponse.error(result.message, result.status), origin)

    return withCors(
      ApiResponse.success(
        { id: result.location.id, code: result.location.code, message: 'Location updated successfully' },
        'Location updated successfully'
      ),
      origin
    )
  } catch (error) {
    console.error('❌ Update location error:', error)
    return withCors(handleApiError(error), origin)
  }
}

// DELETE /api/auth/companies/:id/locations/:locationId
// Removes a location, provided it is not the Head Office (type === 'HQ')
// and has no active staff assigned to it.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; locationId: string } }
) {
  const origin = request.headers.get('origin')

  try {
    // 1. Authenticate
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return withCors(ApiResponse.error('Authorization token is required', 401), origin)
    }
    const decoded = verifyToken(authHeader.replace('Bearer ', ''))
    if (!decoded) {
      return withCors(ApiResponse.error('Invalid or expired token', 401), origin)
    }

    // 2. Authorize — only company managers may delete locations
    const role = decoded.role
    if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(role)) {
      return withCors(
        ApiResponse.error('You do not have permission to delete locations', 403),
        origin
      )
    }

    const { id: companyId, locationId } = params

    const hasAccess = await checkCompanyAccess(decoded.userId, companyId, role)
    if (!hasAccess) {
      return withCors(ApiResponse.error('You do not have access to this company', 403), origin)
    }

    // 3. Resolve the location within the company
    const location = await prisma.location.findFirst({
      where: { id: locationId, companyId },
    })
    if (!location) {
      return withCors(ApiResponse.error('Location not found', 404), origin)
    }

    // 4. Constraint: the Head Office cannot be deleted
    if (String(location.type || '').trim().toUpperCase() === 'HQ') {
      return withCors(
        constraintError(
          'CANNOT_DELETE_HEAD_OFFICE',
          'You cannot delete the Head Office. Please assign a new Head Office first.'
        ),
        origin
      )
    }

    // 5. Constraint: the location must have no active staff assigned.
    // Prefer the FK (locationId); also catch legacy staff that were never
    // backfilled but still carry the matching location name string.
    const staffCount = await prisma.staffRecord.count({
      where: {
        companyId,
        isActive: true,
        OR: [
          { locationId: location.id },
          { locationId: null, location: location.name },
        ],
      },
    })
    if (staffCount > 0) {
      return withCors(
        constraintError(
          'LOCATION_HAS_ACTIVE_STAFF',
          `You cannot delete this location because ${staffCount} active staff ${
            staffCount === 1 ? 'member is' : 'members are'
          } assigned to it. Please reassign them first.`
        ),
        origin
      )
    }

    // 6. Delete
    await prisma.location.delete({ where: { id: location.id } })

    return withCors(
      NextResponse.json(
        { success: true, message: 'Location deleted successfully.' },
        { status: 200 }
      ),
      origin
    )
  } catch (error) {
    console.error('❌ Location deletion error:', error)
    return withCors(handleApiError(error), origin)
  }
}
