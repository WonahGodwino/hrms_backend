// POST /api/auth/refresh (STATE-001)
// Header: Authorization: Bearer <current access token, expired is fine>
// Body:   { refreshToken }
// Returns a new access token and a new refresh token, or 401 with a code
// (REFRESH_INVALID, ACCOUNT_DEACTIVATED, ACCOUNT_BLOCKED, SESSION_CLEARED).
import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { refreshSession } from '@/app/lib/auth/refresh-token'
import { readJsonBody } from '@/app/lib/validation/request-body'
import { refreshBodySchema } from '@/app/lib/validation/auth-schemas'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const body = await readJsonBody(request, refreshBodySchema)
    if (!body.ok) return withCors(ApiResponse.error('refreshToken is required', 400), origin)

    const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null
    const result = await refreshSession(accessToken, body.data.refreshToken)
    if (!result.ok) {
      return withCors(ApiResponse.error('Session can no longer be renewed. Please sign in again.', result.status, [], { code: result.code }), origin)
    }
    return withCors(ApiResponse.success({ token: result.token, refreshToken: result.refreshToken }, 'Session renewed'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
