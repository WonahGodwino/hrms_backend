import { NextRequest } from 'next/server'
import { handleCorsOptions } from '@/app/lib/cors'
import { signupRoute } from '@/app/lib/trial/signup/http'
import { resendCode } from '@/app/lib/trial/signup/service'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export const POST = signupRoute((body) => resendCode(body.signupId, body.channel))
