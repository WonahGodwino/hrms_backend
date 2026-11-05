// src/app/api/auth/session-status/route.ts
// Device Management — cheap polling endpoint. AuthContext.jsx polls this
// every ~60s so a blocked account or a cleared/evicted device gets the
// browser logged out within a bounded window, without paying the cost of
// the full /auth/me payload on every poll.
import { NextRequest } from 'next/server'
import { assertSessionValid, requireAuth } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const decoded = requireAuth(token)

    const sessionCheck = await assertSessionValid(decoded)
    if (!sessionCheck.valid) {
      return withCors(
        ApiResponse.error('Your session is no longer valid.', 401, [], { code: sessionCheck.code }),
        origin
      )
    }

    return withCors(ApiResponse.success({ valid: true }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
