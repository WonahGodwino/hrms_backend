// src/app/api/auth/companies/[id]/locations/route.ts
// POST  /api/auth/companies/:id/locations  — add a new location/branch
// PATCH /api/auth/companies/:id/locations  — update a location (id in body)
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verifyToken, checkCompanyAccess } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { generateLocationCode, updateCompanyLocation } from '@/app/lib/companies/location-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

// Authenticates and authorizes a company-management caller.
// Returns { error } (a CORS-wrapped response) on failure, or { user }.
async function authorize(request: NextRequest, companyId: string, origin: string | null) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: withCors(ApiResponse.error('Authorization token is required', 401), origin) }
  }
  const decoded = verifyToken(authHeader.replace('Bearer ', ''))
  if (!decoded) {
    return { error: withCors(ApiResponse.error('Invalid or expired token', 401), origin) }
  }
  if (!['SUPER_ADMIN', 'ADMIN', 'HR'].includes(decoded.role)) {
    return { error: withCors(ApiResponse.error('You do not have permission to manage locations', 403), origin) }
  }
  const hasAccess = await checkCompanyAccess(decoded.userId, companyId, decoded.role)
  if (!hasAccess) {
    return { error: withCors(ApiResponse.error('You do not have access to this company', 403), origin) }
  }
  return { user: decoded }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const companyId = params.id
    const auth = await authorize(request, companyId, origin)
    if ('error' in auth) return auth.error

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (!company) return withCors(ApiResponse.error('Company not found', 404), origin)

    const body = await request.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) return withCors(ApiResponse.error('Location name is required', 400), origin)

    const state = body?.state ? String(body.state).trim() : null
    const code = await generateLocationCode(prisma, companyId, state, name)

    const location = await prisma.location.create({
      data: {
        companyId,
        name,
        code,
        type: body?.type ? String(body.type).trim() : null,
        state,
        lga: body?.lga ? String(body.lga).trim() : null,
        address: body?.address ? String(body.address).trim() : null,
      },
    })

    return withCors(
      ApiResponse.success(
        { id: location.id, code: location.code, message: 'Location added successfully' },
        'Location added successfully'
      ),
      origin
    )
  } catch (error) {
    console.error('❌ Add location error:', error)
    return withCors(handleApiError(error), origin)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const companyId = params.id
    const auth = await authorize(request, companyId, origin)
    if ('error' in auth) return auth.error

    const body = await request.json().catch(() => ({}))
    const locationId = String(body?.locationId || body?.id || '').trim()
    if (!locationId) {
      return withCors(
        ApiResponse.error(
          'locationId is required in the body (or use PATCH /locations/:locationId)',
          400
        ),
        origin
      )
    }

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
