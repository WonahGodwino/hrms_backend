// [ai-assistant] Rate an assistant reply — PATCH { rating: 1 to 5, or 0 to clear }. Only the person who owns the conversation can rate,
// and only assistant replies. Needs no connected key: ratings are feedback, not a model call.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma, { requireConnected: false })
    if (isGuardError(guard)) return guard

    const body = (await request.json().catch(() => ({}))) as { rating?: unknown }
    const rating = body.rating
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 0 || rating > 5) {
      return withCors(ApiResponse.error('rating must be a whole number from 1 to 5 (0 clears it)', 400), origin)
    }

    const message = await prisma.aiMessage.findFirst({
      where: { id: params.id, role: 'assistant', conversation: { companyId: guard.companyId, userId: guard.user.userId } },
      select: { id: true },
    })
    if (!message) return withCors(ApiResponse.notFound('Message not found'), origin)

    await prisma.aiMessage.update({ where: { id: message.id }, data: { rating: rating === 0 ? null : rating } })
    return withCors(ApiResponse.success({ rating }, 'Saved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
