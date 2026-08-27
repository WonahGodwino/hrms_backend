import { NextRequest } from 'next/server'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/assessments/:id/questions/generate
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    return withCors(
      ApiResponse.success({
        available: false,
        message: 'AI question generation is not connected yet.',
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
