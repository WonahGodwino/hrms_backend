// [ai-assistant] Anthropic provider adapter — uses fetch, no SDK.
import type {
  AiProvider,
  ChatMessage,
  ChatOptions,
  ProviderErrorCode,
  StreamEvent,
  ToolDefinition,
} from './types'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const TIMEOUT_MS = 60_000
// The key test uses the cheapest model and a one-token reply; chat uses the model the company chose.
const TEST_MODEL = 'claude-haiku-5-5'
const DEFAULT_MODEL = 'claude-sonnet-5-5'

function mapTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}

export function mapMessages(messages: ChatMessage[]) {
  const out: Record<string, unknown>[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      if (m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: [
            ...(m.content ? [{ type: 'text', text: m.content }] : []),
            ...m.toolCalls.map((tc) => ({ type: 'tool_use', id: tc.id, name: tc.name, input: safeJson(tc.arguments) })),
          ],
        })
      } else {
        out.push({ role: 'assistant', content: m.content })
      }
    } else if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }
      const prev = out[out.length - 1]
      // All results for one assistant turn go in a single user message.
      if (prev && prev.role === 'user' && Array.isArray(prev.content) && (prev.content as { type?: string }[]).every((b) => b.type === 'tool_result')) {
        ;(prev.content as unknown[]).push(block)
      } else {
        out.push({ role: 'user', content: [block] })
      }
    }
  }
  return out
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function classifyError(status: number, body: string): ProviderErrorCode {
  if (status === 401) return 'auth_failed'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_down'
  return 'unknown'
}

export function createAnthropicProvider(apiKey: string, modelId: string = DEFAULT_MODEL): AiProvider {
  async function* chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: ChatOptions,
  ): AsyncGenerator<StreamEvent> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const body: Record<string, unknown> = {
        model: modelId,
        max_tokens: options.maxTokens ?? 4096,
        system: options.systemPrompt,
        messages: mapMessages(messages),
        stream: true,
      }
      if (options.temperature !== undefined) body.temperature = options.temperature
      if (tools.length) body.tools = mapTools(tools)

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const code = classifyError(res.status, text)
        yield { type: 'error', code, message: `Anthropic ${res.status}: ${text.slice(0, 200)}` }
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        yield { type: 'error', code: 'unknown', message: 'No response body' }
        return
      }

      const decoder = new TextDecoder()
      let buf = ''
      let inputTokens = 0
      let outputTokens = 0
      let stopReason = 'end_turn'
      // Tool calls arrive as a tool_use block followed by partial JSON pieces; collect them by block index.
      const toolBlocks = new Map<number, { id: string; name: string; args: string }>()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue

          let event: Record<string, any>
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          const t = event.type
          if (t === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens ?? 0
          } else if (t === 'content_block_start') {
            if (event.content_block?.type === 'tool_use') {
              toolBlocks.set(event.index ?? toolBlocks.size, { id: event.content_block.id ?? '', name: event.content_block.name ?? '', args: '' })
              yield {
                type: 'status',
                text: `Calling ${event.content_block.name}…`,
              }
            }
          } else if (t === 'content_block_delta') {
            const delta = event.delta
            if (delta?.type === 'text_delta' && delta.text) {
              yield { type: 'delta', text: delta.text }
            } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
              const block = toolBlocks.get(event.index ?? -1)
              if (block) block.args += delta.partial_json
            }
          } else if (t === 'content_block_stop') {
            // check if the stopped block was a tool_use
          } else if (t === 'message_delta') {
            outputTokens = event.usage?.output_tokens ?? outputTokens
            stopReason = event.delta?.stop_reason ?? stopReason
          } else if (t === 'message_stop') {
            // final
          }

          // Extract completed tool calls from message_delta or message_stop
          if (t === 'message_stop' || t === 'message_delta') {
            // Tool calls are accumulated from content blocks; we emit them
            // after the full message is assembled in the orchestrator.
          }
        }
      }

      for (const [, tool] of [...toolBlocks.entries()].sort((a, b) => a[0] - b[0])) {
        if (tool.id && tool.name) yield { type: 'tool_call', id: tool.id, name: tool.name, arguments: tool.args || '{}' }
      }

      yield { type: 'done', usage: { inputTokens, outputTokens }, stopReason }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        yield { type: 'error', code: 'provider_down', message: 'Request timed out (60s)' }
      } else {
        yield { type: 'error', code: 'unknown', message: err.message?.slice(0, 200) ?? 'Unknown error' }
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async function testConnection(): Promise<boolean> {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: TEST_MODEL,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      return res.status === 200
    } catch {
      return false
    }
  }

  return { chat, testConnection }
}
