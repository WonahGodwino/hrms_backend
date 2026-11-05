// [ai-assistant] API key management — PUT (test + save) and DELETE (clear).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { encryptKey, isVaultConfigured } from '@/app/lib/ai/keyVault'
import { getModelInfo, modelsForProvider } from '@/app/lib/ai/models'
import { createAnthropicProvider } from '@/app/lib/ai/providers/anthropic'
import { createOpenAIProvider } from '@/app/lib/ai/providers/openai'
import { actorFor, recordCoreSetupEvent } from '@/app/lib/core-setup/audit'
import { TERMS_ACTION, TERMS_VERSION, termsStatus } from '@/app/lib/ai/terms'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 5

async function checkKeyTestRateLimit(companyId: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)
  const count = await prisma.aIUsageLog.count({
    where: {
      companyId,
      endpoint: 'assistant_key_test',
      createdAt: { gte: since },
    },
  })
  return count < RATE_LIMIT_MAX
}

async function logKeyTest(companyId: string) {
  await prisma.aIUsageLog.create({
    data: {
      companyId,
      service: 'assistant',
      endpoint: 'assistant_key_test',
      model: 'key_test',
      tokensUsed: 0,
      cost: 0,
      inputLength: 0,
      outputLength: 0,
    },
  })
}

// These routes are how a company BECOMES connected, so they cannot require it (the flag, role and platform switch still apply).
export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const guard = await aiGuard(request, companyId, prisma, { requireConnected: false })
    if (isGuardError(guard)) return guard

    if (guard.user.role !== 'ADMIN' && guard.user.role !== 'HR') {
      return withCors(ApiResponse.forbidden('Only the company\'s Admin or HR can manage its API key'), origin)
    }

    const body = await request.json()
    const { apiKey, provider } = body

    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      return withCors(ApiResponse.error('A valid API key is required', 400), origin)
    }

    const validProviders = ['anthropic', 'openai']
    if (!provider || !validProviders.includes(provider)) {
      return withCors(ApiResponse.error('Provider must be anthropic or openai', 400), origin)
    }

    // The company accepts the AI Assistant terms once per terms version, when it connects a key.
    const terms = await termsStatus(prisma, guard.companyId)
    if (!terms.accepted && body.acceptTerms !== true) {
      return withCors(ApiResponse.error('Accept the AI Assistant terms to connect a key.', 400, [], { code: 'TERMS_REQUIRED', termsVersion: TERMS_VERSION }), origin)
    }

    // Keys are stored encrypted; without the server secret nothing can be saved, so say so before testing the key.
    if (!isVaultConfigured()) {
      return withCors(
        ApiResponse.error(
          'The server is not set up to store AI keys yet: AI_PROVIDER_KEY_SECRET (at least 32 characters) is missing from the backend environment. Ask your system administrator to add it and restart the server.',
          503,
          [],
          { code: 'KEY_VAULT_NOT_CONFIGURED' },
        ),
        origin,
      )
    }

    const allowed = await checkKeyTestRateLimit(guard.companyId)
    if (!allowed) {
      return withCors(ApiResponse.error('Key test rate limit exceeded (5 per hour). Try again later.', 429), origin)
    }

    await logKeyTest(guard.companyId)

    let ok = false
    try {
      if (provider === 'anthropic') {
        const adapter = createAnthropicProvider(apiKey)
        ok = await adapter.testConnection()
      } else {
        const adapter = createOpenAIProvider(apiKey, modelsForProvider('openai')[0].id)
        ok = await adapter.testConnection()
      }
    } catch {
      ok = false
    }

    if (!ok) {
      await prisma.aiAssistantSettings.upsert({
        where: { companyId: guard.companyId },
        update: { keyStatus: 'invalid', lastTestedAt: new Date() },
        create: {
          companyId: guard.companyId,
          provider,
          keyStatus: 'invalid',
          lastTestedAt: new Date(),
        },
      })
      return withCors(
        ApiResponse.error('API key validation failed. Please check the key and try again.', 400),
        origin,
      )
    }

    const { encrypted, last4 } = encryptKey(apiKey)

    // Keep the chosen model valid for the provider the key belongs to (switching Anthropic -> OpenAI must not
    // leave a Claude model selected). Connecting a key when none is stored switches the company on; replacing a
    // stored key leaves the company's own on/off switch as its Admin or HR set it.
    const existing = await prisma.aiAssistantSettings.findUnique({
      where: { companyId: guard.companyId },
      select: { model: true, enabled: true, apiKeyEncrypted: true },
    })
    const currentModel = existing?.model ? getModelInfo(existing.model) : undefined
    const model = currentModel && currentModel.provider === provider ? currentModel.id : modelsForProvider(provider)[0].id
    const enabled = existing?.apiKeyEncrypted ? existing.enabled : true

    const updated = await prisma.aiAssistantSettings.upsert({
      where: { companyId: guard.companyId },
      update: {
        provider,
        model,
        enabled,
        apiKeyEncrypted: encrypted,
        keyLast4: last4,
        keyStatus: 'ok',
        lastTestedAt: new Date(),
        updatedById: guard.user.userId,
        updatedByName: guard.user.email,
      },
      create: {
        companyId: guard.companyId,
        provider,
        model,
        enabled,
        apiKeyEncrypted: encrypted,
        keyLast4: last4,
        keyStatus: 'ok',
        lastTestedAt: new Date(),
        updatedById: guard.user.userId,
        updatedByName: guard.user.email,
      },
      select: {
        id: true,
        enabled: true,
        provider: true,
        model: true,
        keyLast4: true,
        keyStatus: true,
        lastTestedAt: true,
      },
    })

    const actor = await actorFor(guard.user)
    if (!terms.accepted) {
      await recordCoreSetupEvent(prisma, {
        companyId: guard.companyId, actor, kind: 'setting', area: 'ai', action: TERMS_ACTION, object: TERMS_VERSION,
        summary: ` accepted the AI Assistant terms (version ${TERMS_VERSION}) for this company.`,
      })
    }
    await recordCoreSetupEvent(prisma, {
      companyId: guard.companyId,
      actor,
      kind: 'setting',
      area: 'ai',
      action: 'AI provider key saved',
      summary: `${provider} API key ending in ${last4} was tested and saved.`,
    })

    return withCors(ApiResponse.success(updated, 'API key verified and saved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const guard = await aiGuard(request, companyId, prisma, { requireConnected: false })
    if (isGuardError(guard)) return guard

    if (guard.user.role !== 'ADMIN' && guard.user.role !== 'HR') {
      return withCors(ApiResponse.forbidden('Only the company\'s Admin or HR can manage its API key'), origin)
    }

    const existing = await prisma.aiAssistantSettings.findUnique({
      where: { companyId: guard.companyId },
    })

    if (!existing || !existing.apiKeyEncrypted) {
      return withCors(ApiResponse.error('No API key is configured', 404), origin)
    }

    const prevLast4 = existing.keyLast4

    await prisma.aiAssistantSettings.update({
      where: { companyId: guard.companyId },
      data: {
        apiKeyEncrypted: null,
        keyLast4: null,
        keyStatus: 'none',
        enabled: false,
        updatedById: guard.user.userId,
        updatedByName: guard.user.email,
      },
    })

    const actor = await actorFor(guard.user)
    await recordCoreSetupEvent(prisma, {
      companyId: guard.companyId,
      actor,
      kind: 'setting',
      area: 'ai',
      action: 'AI provider key removed',
      summary: `API key ending in ${prevLast4 ?? '????'} was removed. AI Assistant disabled.`,
    })

    return withCors(ApiResponse.success(null, 'API key removed and AI Assistant disabled'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
