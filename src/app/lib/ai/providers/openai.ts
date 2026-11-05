// [ai-assistant] OpenAI provider adapter — uses fetch, no SDK.
import type {
  AiProvider,
  ChatMessage,
  ChatOptions,
  ProviderErrorCode,
  StreamEvent,
  ToolDefinition,
} from './types'

const API_URL = 'https://api.openai.com/v1/chat/completions'
const TIMEOUT_MS = 60_000

function mapTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function mapMessages(systemPrompt: string, messages: ChatMessage[]) {
  const out: Record<string, unknown>[] = [{ role: 'system', content: systemPrompt }]
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      if (m.toolCalls?.length) {
        out.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          })),
        })
      } else {
        out.push({ role: 'assistant', content: m.content })
      }
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.content,
      })
    }
  }
  return out
}

function classifyError(status: number): ProviderErrorCode {
  if (status === 401) return 'auth_failed'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_down'
  return 'unknown'
}

export function createOpenAIProvider(apiKey: string, modelId: string): AiProvider {
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
        max_completion_tokens: options.maxTokens ?? 4096,
        messages: mapMessages(options.systemPrompt, messages),
        stream: true,
        stream_options: { include_usage: true },
      }
      if (options.temperature !== undefined) body.temperature = options.temperature
      if (tools.length) body.tools = mapTools(tools)

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const code = classifyError(res.status)
        yield { type: 'error', code, message: `OpenAI ${res.status}: ${text.slice(0, 200)}` }
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
      let stopReason = 'stop'

      // Accumulate partial tool calls across chunks
      const partialToolCalls = new Map<number, { id: string; name: string; args: string }>()

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

          let chunk: Record<string, any>
          try {
            chunk = JSON.parse(raw)
          } catch {
            continue
          }

          // Usage comes in the final chunk
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0
            outputTokens = chunk.usage.completion_tokens ?? 0
          }

          const choice = chunk.choices?.[0]
          if (!choice) continue

          if (choice.finish_reason) {
            stopReason = choice.finish_reason
          }

          const delta = choice.delta
          if (!delta) continue

          if (delta.content) {
            yield { type: 'delta', text: delta.content }
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!partialToolCalls.has(idx)) {
                partialToolCalls.set(idx, { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' })
                if (tc.function?.name) {
                  yield { type: 'status', text: `Calling ${tc.function.name}…` }
                }
              }
              const entry = partialToolCalls.get(idx)!
              if (tc.id) entry.id = tc.id
              if (tc.function?.name) entry.name = tc.function.name
              if (tc.function?.arguments) entry.args += tc.function.arguments
            }
          }
        }
      }

      // Emit any completed tool calls
      for (const [, tc] of partialToolCalls) {
        if (tc.id && tc.name) {
          yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: tc.args }
        }
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
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      })
      return res.status === 200
    } catch {
      return false
    }
  }

  return { chat, testConnection }
}
