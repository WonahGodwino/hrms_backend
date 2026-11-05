// Shared request wrapper for the public sign-up routes: CORS, JSON body, and the
// SignupError -> response mapping. Unexpected errors are logged and returned generic.
import { NextRequest } from 'next/server'
import { ApiResponse } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'
import { clientIp } from './rate-limit'
import { SignupError, type SignupContext } from './service'

export function signupRoute(handler: (body: any, ctx: SignupContext) => Promise<unknown>) {
  return async (req: NextRequest) => {
    const origin = req.headers.get('origin')
    try {
      const body = await req.json().catch(() => ({}))
      const ctx: SignupContext = {
        ip: clientIp(req),
        deviceId: req.headers.get('x-device-id')?.trim().slice(0, 200) || null,
      }
      return withCors(ApiResponse.success(await handler(body || {}, ctx)), origin)
    } catch (error) {
      if (error instanceof SignupError) {
        return withCors(ApiResponse.error(error.message, error.status, undefined, error.extra), origin)
      }
      console.error('[signup] unexpected error:', error)
      return withCors(ApiResponse.error('Something went wrong. Please try again.', 500), origin)
    }
  }
}
