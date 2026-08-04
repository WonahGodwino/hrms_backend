import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { phedRateLimit } from '@/app/lib/phed/rate-limit'

export async function OPTIONS(req: NextRequest) { return handleCorsOptions(req) }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  const rl = phedRateLimit(req, 'write')
  if (rl) return withCors(rl, origin)
  try {
    return withCors(
      ApiResponse.error('Direct payroll approval is disabled. Complete the PHED approval memo workflow through final MD/CEO approval.', 410),
      origin,
    )
  } catch (e) { return withCors(handleApiError(e), origin) }
}

