// POST /api/trial/extension-request: HR asks the team for a few more days. Allowed while the
// account is read only too (the edge guard lets /api/trial/ writes through).
import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { requestExtension, ReviewError } from '@/app/lib/trial/review'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['HR', 'ADMIN'])
    if (!user.companyId) return withCors(ApiResponse.error('No company on this account.', 400), origin)
    const body = await req.json().catch(() => ({}))
    await requestExtension(user.companyId, typeof body?.reason === 'string' ? body.reason : '')
    return withCors(ApiResponse.success({}, 'Your request has been sent to our team.'), origin)
  } catch (error) {
    if (error instanceof ReviewError) return withCors(ApiResponse.error(error.message, error.status), origin)
    return withCors(handleApiError(error), origin)
  }
}
