// [ai-assistant] Shared types for AI provider adapters.

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: ToolCallResult[]
}

export interface ToolCallResult {
  id: string
  name: string
  arguments: string
}

export type StreamEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number }; stopReason: string }
  | { type: 'error'; code: ProviderErrorCode; message: string }

export type ProviderErrorCode = 'auth_failed' | 'rate_limited' | 'provider_down' | 'unknown'

export interface ChatOptions {
  systemPrompt: string
  maxTokens?: number
  temperature?: number
}

export interface AiProvider {
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: ChatOptions,
  ): AsyncGenerator<StreamEvent>

  testConnection(): Promise<boolean>
}
