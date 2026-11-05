// [ai-assistant] Streaming messages endpoint — POST returns SSE.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, getCorsHeaders } from '@/app/lib/cors'
import { aiGuard, isGuardError, logRefusal } from '@/app/lib/ai/guard'
import { orchestrate } from '@/app/lib/ai/orchestrator'
import { checkErrorRate, checkUsageWarning, handleRejectedKey, estimateCost, isRefused } from '@/app/lib/ai/monitoring'
import { recordCoreSetupEvent } from '@/app/lib/core-setup/audit'
import { redactSensitive, redactForHistory } from '@/app/lib/ai/redact'
import type { ChatMessage } from '@/app/lib/ai/providers/types'

// SSE must stream, not buffer: force a dynamic Node runtime so the platform does
// not statically optimise or batch the response.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// Defaults when a company has not set its own (Settings > AI Assistant): 20 per person per hour, 500 per company per day.
const DEFAULT_HOURLY = 20
const DEFAULT_DAILY = 500

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const guard = await aiGuard(request, companyId, prisma)
    if (isGuardError(guard)) return guard

    if (!guard.settings || guard.settings.keyStatus !== 'ok' || !guard.settings.apiKeyEncrypted) {
      return new Response(
        JSON.stringify({ success: false, message: 'AI Assistant is not configured' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await request.json()
    const { conversationId, message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(
        JSON.stringify({ success: false, message: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Identity-like numbers (BVN/NIN/account/phone patterns) are removed from what the user typed BEFORE it is stored or sent to the
    // provider. The user is told, so they can rephrase.
    const text = redactSensitive(message)
    const wasRedacted = text !== message

    const hourlyLimit = guard.settings.hourlyLimit ?? DEFAULT_HOURLY
    const dailyLimit = guard.settings.dailyLimit ?? DEFAULT_DAILY
    // Requests are counted from the usage log, not from stored messages, so deleting a conversation does not reset anyone's limit.
    // Refused requests never reached the provider and do not count.
    const requestsSince = async (since: Date, userId?: string, cap = 5001) =>
      (
        await prisma.aIUsageLog.findMany({
          where: { companyId: guard.companyId, service: 'assistant', createdAt: { gte: since }, ...(userId ? { metadata: { path: ['userId'], equals: userId } } : {}) },
          select: { metadata: true },
          take: cap,
        })
      ).filter((r) => !isRefused(r.metadata)).length
    const [personCount, companyCount] = await Promise.all([
      requestsSince(new Date(Date.now() - HOUR_MS), guard.user.userId, hourlyLimit + 1),
      requestsSince(new Date(Date.now() - DAY_MS), undefined, dailyLimit + 1),
    ])
    if (personCount >= hourlyLimit || companyCount >= dailyLimit) {
      await logRefusal(prisma, guard.companyId, guard.user.userId, 'rate_limited')
      const message = personCount >= hourlyLimit
        ? `You have reached the limit of ${hourlyLimit} requests per hour. Try again later, or ask an Admin to raise the limit in Settings.`
        : `Your company has reached its limit of ${dailyLimit} requests a day. Try again tomorrow, or ask an Admin to raise the limit in Settings.`
      return new Response(
        JSON.stringify({ success: false, message }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    let conversation
    if (conversationId) {
      conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, companyId: guard.companyId, userId: guard.user.userId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: 100 } },
      })
      if (!conversation) {
        return new Response(
          JSON.stringify({ success: false, message: 'Conversation not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } else {
      conversation = await prisma.aiConversation.create({
        data: {
          companyId: guard.companyId,
          userId: guard.user.userId,
          title: redactForHistory(text).slice(0, 100),
          lastMessageAt: new Date(),
        },
        include: { messages: true },
      })
    }

    await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: redactForHistory(text),
      },
    })

    const history: ChatMessage[] = (conversation.messages ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
    }))

    const visibleCategories = (guard.settings.visibleCategories as string[]) ?? []

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        let assistantText = ''
        let failed = false
        const startedAt = Date.now()
        const baseMeta = { userId: guard.user.userId, role: guard.user.role, provider: guard.settings!.provider, conversationId: conversation.id }

        if (wasRedacted) {
          const notice = { type: 'status', text: 'Numbers that look like identity, bank or phone numbers were removed from your message before it was sent.' }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(notice)}\n\n`))
        }

        // A failed request is logged (status only, never the provider's message) so the error-rate alert can see it.
        const logFailure = async () => {
          if (failed) return
          failed = true
          await prisma.aIUsageLog
            .create({
              data: {
                companyId: guard.companyId, service: 'assistant', endpoint: 'assistant', model: guard.settings!.model,
                tokensUsed: 0, cost: 0, inputLength: 0, outputLength: 0,
                metadata: { ...baseMeta, status: 'error', durationMs: Date.now() - startedAt },
              },
            })
            .catch(() => null)
        }

        try {
          const events = orchestrate({
            prisma,
            companyId: guard.companyId,
            userId: guard.user.userId,
            userRole: guard.user.role,
            userEmail: guard.user.email,
            conversationId: conversation.id,
            conversationHistory: history,
            newMessage: text,
            settings: {
              provider: guard.settings!.provider,
              model: guard.settings!.model,
              apiKeyEncrypted: guard.settings!.apiKeyEncrypted!,
              visibleCategories,
            },
          })

          for await (const event of events) {
            const sseData = `data: ${JSON.stringify(event)}\n\n`
            controller.enqueue(encoder.encode(sseData))

            if (event.type === 'delta') {
              assistantText += event.text
            }

            if (event.type === 'error') {
              // Being switched off mid-request is the company's or a Super Admin's choice, not a provider failure.
              if (event.code !== 'assistant_off') await logFailure()
              if (event.code === 'auth_failed') {
                const rejected = await handleRejectedKey(prisma, guard.companyId).catch(() => null)
                if (rejected?.changed) {
                  await recordCoreSetupEvent(prisma, {
                    companyId: guard.companyId, actor: { name: 'AI Assistant', type: 'automation' }, kind: 'setting', area: 'ai',
                    action: 'AI provider key rejected', summary: 'The provider rejected the company\'s key, so the AI Assistant was switched off.',
                  }).catch(() => null)
                }
              }
            }

            if (event.type === 'done') {
              const audit = event.audit ?? { tools: [], categories: [], refusals: [], retried: false }
              assistantText = event.fullText || assistantText

              // Stored with the reply: the names of the tools used and how many records each returned. Never the records themselves.
              const savedReply = await prisma.aiMessage.create({
                data: {
                  conversationId: conversation.id,
                  role: 'assistant',
                  content: redactForHistory(assistantText),
                  ...(audit.tools.length ? { toolCalls: audit.tools } : {}),
                },
              })

              await prisma.aiConversation.update({
                where: { id: conversation.id },
                data: { lastMessageAt: new Date() },
              })

              await prisma.aIUsageLog.create({
                data: {
                  companyId: guard.companyId,
                  service: 'assistant',
                  endpoint: 'assistant',
                  model: guard.settings!.model,
                  tokensUsed: event.usage.inputTokens + event.usage.outputTokens,
                  cost: Number(estimateCost([{ model: guard.settings!.model, inputLength: event.usage.inputTokens, outputLength: event.usage.outputTokens }]).toFixed(6)),
                  inputLength: event.usage.inputTokens,
                  outputLength: event.usage.outputTokens,
                  // Who asked, which tools ran, which categories and how many records were sent: metadata only, never the content.
                  metadata: {
                    ...baseMeta,
                    status: 'ok',
                    durationMs: Date.now() - startedAt,
                    tools: audit.tools,
                    categories: audit.categories,
                    records: audit.tools.reduce((n, t) => n + t.records, 0),
                    refusals: audit.refusals,
                    retried: audit.retried,
                  },
                },
              })

              const doneEvent = `data: ${JSON.stringify({ ...event, conversationId: conversation.id, messageId: savedReply?.id })}\n\n`
              controller.enqueue(encoder.encode(doneEvent))
            }
          }
        } catch (err: unknown) {
          await logFailure()
          const msg = err instanceof Error ? err.message : 'Internal error'
          const errEvent = `data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`
          controller.enqueue(encoder.encode(errEvent))
        } finally {
          // Monitoring only creates notifications and must never get in the way of the reply.
          try {
            await checkErrorRate(prisma, guard.companyId)
            if (!failed) await checkUsageWarning(prisma, guard.companyId, guard.settings!.monthlyWarning)
          } catch {
            /* ignore */
          }
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Stop reverse proxies (nginx) from buffering the stream.
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify(handleApiError(error)),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
}
