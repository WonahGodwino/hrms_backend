// [ai-assistant] Single conversation — GET (messages) and DELETE.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { redactForHistory } from '@/app/lib/ai/redact'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const guard = await aiGuard(request, companyId, prisma)
    if (isGuardError(guard)) return guard

    const conversation = await prisma.aiConversation.findFirst({
      where: {
        id: params.id,
        companyId: guard.companyId,
        userId: guard.user.userId,
        deletedAt: null,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!conversation) {
      return withCors(ApiResponse.notFound('Conversation not found'), origin)
    }

    const messages = conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.role === 'assistant' ? redactForHistory(m.content) : m.content,
      rating: m.rating,
      // Tool names and how many records each returned; never the records themselves.
      toolCalls: m.toolCalls ?? undefined,
      createdAt: m.createdAt,
    }))

    return withCors(
      ApiResponse.success({
        id: conversation.id,
        title: conversation.title,
        lastMessageAt: conversation.lastMessageAt,
        createdAt: conversation.createdAt,
        messages,
      }),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const guard = await aiGuard(request, companyId, prisma)
    if (isGuardError(guard)) return guard

    const conversation = await prisma.aiConversation.findFirst({
      where: {
        id: params.id,
        companyId: guard.companyId,
        userId: guard.user.userId,
        deletedAt: null,
      },
    })

    if (!conversation) {
      return withCors(ApiResponse.notFound('Conversation not found'), origin)
    }

    // The text goes at once; the bare row stays until retention so the company's usage counts stay accurate.
    await prisma.aiMessage.deleteMany({ where: { conversationId: conversation.id } })
    await prisma.aiConversation.update({ where: { id: conversation.id }, data: { deletedAt: new Date(), title: null } })

    return withCors(ApiResponse.success(null, 'Conversation deleted'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
