// [ai-assistant] Orchestrator — runs the conversation loop with tool calling.
import type { PrismaClient } from '@prisma/client'
import type { ChatMessage, StreamEvent, ToolDefinition as ProviderToolDef } from './providers/types'
import type { AiProvider, ProviderErrorCode } from './providers/types'
import { isPlatformEnabled } from './flags'
import { decryptKey } from './keyVault'
import { getModelInfo } from './models'
import { createAnthropicProvider } from './providers/anthropic'
import { createOpenAIProvider } from './providers/openai'
import { getTools, getToolDefinitions, getAllToolNames } from './tools'
import { sanitizeToolResult, wrapToolData, DATA_RULE } from './freeText'
import type { ToolContext } from './tools'

const MAX_TOOL_ITERATIONS = 8
const RETRY_DELAY_MS = 800
const STREAM_CHECK_MS = 2000

export interface OrchestratorInput {
  prisma: PrismaClient
  companyId: string
  userId: string
  userRole: string
  userEmail: string
  conversationId?: string
  conversationHistory: ChatMessage[]
  newMessage: string
  settings: {
    provider: string
    model: string
    apiKeyEncrypted: string
    visibleCategories: string[]
  }
  // Pause before the single retry of a failed provider request (tests set 0).
  retryDelayMs?: number
}

// What one request did, for the per-request audit record: metadata only, never the content of any data.
export interface RequestAudit {
  tools: { name: string; records: number }[]
  categories: string[]
  // A tool the model asked for that was hidden by the company's settings or does not exist: counted by reason in monitoring.
  refusals: ('hidden_category' | 'unknown_tool')[]
  retried: boolean
}

export type OrchestratorEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; name: string; args?: Record<string, unknown> }
  | { type: 'data_categories'; categories: string[] }
  // A table the person can copy or download, from the summarise tool (already passed through the sensitive-value filter).
  | { type: 'report'; report: { title: string; columns: string[]; rows: string[][]; notes: string[] } }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number }; fullText: string; audit: RequestAudit }
  | { type: 'error'; message: string; code?: string }

function buildSystemPrompt(
  companyName: string,
  userRole: string,
  toolDefs: { name: string; description: string }[],
): string {
  const today = new Date().toISOString().slice(0, 10)
  const toolList = toolDefs.map((t) => `- ${t.name}: ${t.description}`).join('\n')

  return `You are the 247HR AI Assistant for ${companyName}.
Today's date: ${today}.
The user's role: ${userRole}.

You help HR professionals with staff queries, leave management, payroll insights, document drafting, and company setup.

You have access to the following tools:
${toolList}

Rules:
- You cannot create, update, or delete any records yourself. You can only read data and PROPOSE changes with the propose_* tools.
- A proposal changes nothing. It waits in the Action Center until an Admin or HR approves it, and the person who asked cannot approve their own proposal. Always tell the user that, and never say a change has been made.
- Propose only what the user asked for, using real values from the read tools. Never guess staff numbers, department names or designations.
- Never reveal raw API keys, passwords, or encrypted data.
- Fields marked "[hidden by company policy]" are redacted — do not guess or reconstruct them.
- Identity data (BVN, NIN, passport) and bank details are always hidden. Do not attempt to access them.
- Be concise, professional, and helpful. Use the tools to answer data questions rather than guessing.
- ${DATA_RULE}`
}

function parseArgs(raw: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : undefined
  } catch {
    return undefined
  }
}

function createProvider(
  provider: string,
  apiKey: string,
  modelId: string,
): AiProvider {
  if (provider === 'anthropic') return createAnthropicProvider(apiKey, modelId)
  return createOpenAIProvider(apiKey, modelId)
}

export async function* orchestrate(input: OrchestratorInput): AsyncGenerator<OrchestratorEvent> {
  const { prisma, companyId, userId, settings } = input

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { companyName: true },
  })
  if (!company) {
    yield { type: 'error', message: 'Company not found' }
    return
  }

  let apiKey: string
  try {
    apiKey = decryptKey(settings.apiKeyEncrypted)
  } catch {
    yield { type: 'error', message: 'Failed to decrypt API key. Please re-save your key.' }
    return
  }

  const toolDefs = getToolDefinitions(settings.visibleCategories)
  const systemPrompt = buildSystemPrompt(company.companyName, input.userRole, toolDefs)

  const provider = createProvider(settings.provider, apiKey, settings.model)
  const providerTools: ProviderToolDef[] = toolDefs.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))

  const toolCtx: ToolContext = {
    prisma,
    companyId,
    userId,
    visibleCategories: settings.visibleCategories,
    conversationId: input.conversationId,
  }

  const messages: ChatMessage[] = [
    ...input.conversationHistory,
    { role: 'user', content: input.newMessage },
  ]

  // The off switch is one click and takes effect at once, including for a request already running: it is checked between rounds and
  // every couple of seconds while an answer streams. A lookup that fails counts as "still on" (a database blip is not a switch-off).
  let lastCheck = Date.now()
  const stillOn = async () => {
    lastCheck = Date.now()
    try {
      if (!(await isPlatformEnabled(prisma))) return false
      const row = await prisma.aiAssistantSettings.findUnique({ where: { companyId }, select: { enabled: true } })
      return row ? row.enabled : true
    } catch {
      return true
    }
  }
  const usedCategories = new Set<string>()
  const toolsUsed: RequestAudit['tools'] = []
  const refusals: RequestAudit['refusals'] = []
  let retried = false
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let fullText = ''

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    if (iteration > 0 && !(await stillOn())) {
      yield { type: 'error', code: 'assistant_off', message: 'The AI Assistant has been switched off.' }
      return
    }
    const pendingToolCalls: { id: string; name: string; arguments: string }[] = []
    let iterationDone = false

    // A failed provider request is retried once, but only if nothing from it reached the user yet: a half-written answer is not repeated.
    for (let attempt = 0; ; attempt++) {
      let produced = false
      let failure: { code: ProviderErrorCode; message: string } | null = null
      try {
        for await (const event of provider.chat(messages, providerTools, { systemPrompt })) {
          if (event.type === 'error') {
            failure = { code: event.code, message: event.message }
            break
          }
          if (event.type === 'status') {
            yield { type: 'status', text: event.text }
          } else if (event.type === 'delta') {
            if (Date.now() - lastCheck > STREAM_CHECK_MS && !(await stillOn())) {
              yield { type: 'error', code: 'assistant_off', message: 'The AI Assistant has been switched off.' }
              return
            }
            produced = true
            fullText += event.text
            yield { type: 'delta', text: event.text }
          } else if (event.type === 'tool_call') {
            produced = true
            pendingToolCalls.push({ id: event.id, name: event.name, arguments: event.arguments })
            yield { type: 'tool_call', name: event.name, args: parseArgs(event.arguments) }
          } else if (event.type === 'done') {
            totalInputTokens += event.usage.inputTokens
            totalOutputTokens += event.usage.outputTokens
            if (event.stopReason !== 'tool_use' && event.stopReason !== 'tool_calls') iterationDone = true
          }
        }
      } catch {
        failure = { code: 'provider_down', message: 'The AI provider could not be reached.' }
      }
      if (!failure) break

      if (failure.code === 'auth_failed') {
        // A rejected key gets a plain message; the provider's own text is not passed on.
        yield { type: 'error', code: 'auth_failed', message: 'The AI provider rejected your company\'s key. An Admin has been notified; the key needs to be replaced in Settings.' }
        return
      }
      if (produced || attempt >= 1) {
        yield { type: 'error', code: failure.code, message: failure.message }
        return
      }
      retried = true
      await new Promise((resolve) => setTimeout(resolve, input.retryDelayMs ?? RETRY_DELAY_MS))
    }

    if (iterationDone || pendingToolCalls.length === 0) break

    if (iteration === MAX_TOOL_ITERATIONS) {
      yield { type: 'status', text: 'Reached maximum tool iterations.' }
      break
    }

    messages.push({
      role: 'assistant',
      content: fullText,
      toolCalls: pendingToolCalls,
    })
    fullText = ''

    const availableTools = getTools(settings.visibleCategories)
    for (const tc of pendingToolCalls) {
      const tool = availableTools.find((t) => t.name === tc.name)
      let result: unknown
      if (!tool) {
        // Asking for a tool the company's settings hide is a refusal (counted by reason); an invented name is something else.
        refusals.push(getAllToolNames().includes(tc.name) ? 'hidden_category' : 'unknown_tool')
        result = { error: `Tool not available: ${tc.name}` }
      } else {
        try {
          const args = JSON.parse(tc.arguments || '{}')
          result = await tool.execute(args, toolCtx)
          // What this reply could contain, so the user can see which categories of data it drew on.
          if (tool.category) usedCategories.add(tool.category)
          if (tool.usesStaffFields) settings.visibleCategories.forEach((cat) => usedCategories.add(cat))
          toolsUsed.push({ name: tool.name, records: countRecords(result) })
          const report = tool.name === 'summarise' ? (result as { report?: { title: string; columns: string[]; rows: string[][]; notes: string[] } } | null)?.report : undefined
          if (report) yield { type: 'report', report }
        } catch {
          // The cause (a database or validation message) is not passed to the model or the user.
          result = { error: 'The tool could not complete this request.' }
          toolsUsed.push({ name: tool.name, records: 0 })
        }
      }

      messages.push({
        role: 'tool',
        // Free text in the result is filtered by what the company hides, and the data is labelled so the model reads it as data.
        content: wrapToolData(tc.name, sanitizeToolResult(result, settings.visibleCategories)),
        toolCallId: tc.id,
      })
    }
  }

  if (usedCategories.size) yield { type: 'data_categories', categories: [...usedCategories] }
  yield {
    type: 'done',
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    fullText,
    audit: { tools: toolsUsed, categories: [...usedCategories], refusals, retried },
  }
}

// How many records a tool result held: the largest top-level list, or its own count of what it returned.
function countRecords(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const obj = result as Record<string, unknown>
  if (typeof obj.returned === 'number') return obj.returned
  const lists = Object.values(obj).filter(Array.isArray) as unknown[][]
  return lists.reduce((max, l) => Math.max(max, l.length), 0)
}