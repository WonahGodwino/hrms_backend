import { NextRequest } from 'next/server'
import { requireRoleAsync } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { decideReview, getReviewDetail, REVIEW_ACTIONS, ReviewError, type ReviewAction } from '@/app/lib/trial/review'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    await requireRoleAsync(token, ['SUPER_ADMIN'])
    const { id } = await params
    return withCors(ApiResponse.success(await getReviewDetail(id)), origin)
  } catch (error) {
    if (error instanceof ReviewError) return withCors(ApiResponse.error(error.message, error.status), origin)
    return withCors(handleApiError(error), origin)
  }
}

// Body: { action: 'approve' | 'decline' | 'extend' | 'ban' | 'recheck-rc', note?: string, days?: number }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireRoleAsync(token, ['SUPER_ADMIN'])
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '').trim().toLowerCase() as ReviewAction
    if (!REVIEW_ACTIONS.includes(action)) return withCors(ApiResponse.error('Invalid action.', 400), origin)

    const result = await decideReview(id, action, { note: typeof body?.note === 'string' ? body.note : '', days: body?.days }, { userId: user.userId })
    return withCors(ApiResponse.success(result, 'Trial review updated.'), origin)
  } catch (error) {
    if (error instanceof ReviewError) return withCors(ApiResponse.error(error.message, error.status), origin)
    return withCors(handleApiError(error), origin)
  }
}
