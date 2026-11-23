// POST /api/auth/registration-link  { email }
// Sends a fresh staff setup link to the address on file (SEC-002). The
// response is identical whether or not an account matched.
import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'
import { sendRegistrationLinks } from '@/app/lib/auth/registration-link'

const GENERIC_MESSAGE = 'If an account is waiting to be set up for this e-mail address, a new setup link has been sent to it.'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const limited = phedRateLimit(request, 'auth')
  if (limited) return withCors(limited, origin)

  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email : ''
    if (!email.includes('@')) {
      return withCors(ApiResponse.error('A valid e-mail address is required', 400), origin)
    }

    await sendRegistrationLinks(email)
    return withCors(ApiResponse.success(null, GENERIC_MESSAGE), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
