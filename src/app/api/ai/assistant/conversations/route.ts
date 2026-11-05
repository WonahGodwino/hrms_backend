// [ai-assistant] Conversation list — GET (own conversations only).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const guard = await aiGuard(request, companyId, prisma)
    if (isGuardError(guard)) return guard

    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200)
    const skip = Math.max(Number(searchParams.get('skip')) || 0, 0)

    const [conversations, total] = await Promise.all([
      prisma.aiConversation.findMany({
        where: { companyId: guard.companyId, userId: guard.user.userId, deletedAt: null },
        orderBy: { lastMessageAt: 'desc' },
        take: limit,
        skip,
        select: {
          id: true,
          title: true,
          lastMessageAt: true,
          createdAt: true,
          _count: { select: { messages: true } },
        },
      }),
      prisma.aiConversation.count({
        where: { companyId: guard.companyId, userId: guard.user.userId, deletedAt: null },
      }),
    ])

    return withCors(ApiResponse.success({ conversations, total }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

// Deletes all of the person's own conversations at once. The messages are removed immediately; a bare row (no title, no text) is kept
// until the retention sweep so usage counts stay accurate.
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma)
    if (isGuardError(guard)) return guard

    const mine = { companyId: guard.companyId, userId: guard.user.userId, deletedAt: null }
    const conversations = await prisma.aiConversation.findMany({ where: mine, select: { id: true } })
    const ids = conversations.map((c) => c.id)
    for (let i = 0; i < ids.length; i += 1000) {
      const batch = ids.slice(i, i + 1000)
      await prisma.aiMessage.deleteMany({ where: { conversationId: { in: batch } } })
      await prisma.aiConversation.updateMany({ where: { id: { in: batch } }, data: { deletedAt: new Date(), title: null } })
    }

    return withCors(ApiResponse.success({ deleted: ids.length }, ids.length ? 'Conversations deleted' : 'Nothing to delete'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}