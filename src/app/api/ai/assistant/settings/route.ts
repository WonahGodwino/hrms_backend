// [ai-assistant] AI Assistant settings — GET (read) and PATCH (update).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { getUserFromToken } from '@/app/lib/auth'
import { actorFor, recordCoreSetupEvent, diffFields } from '@/app/lib/core-setup/audit'
import { termsStatus } from '@/app/lib/ai/terms'
import { estimateCost, isFailed, isRefused } from '@/app/lib/ai/monitoring'
import { getModelInfo } from '@/app/lib/ai/models'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = await getUserFromToken(token)
    if (!user) {
      return withCors(ApiResponse.error('Invalid or expired token', 401), origin)
    }

    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'HR']
    if (!allowedRoles.includes(user.role)) {
      return withCors(ApiResponse.forbidden('You do not have access to AI Assistant settings'), origin)
    }

    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || user.companyId
    if (!companyId) {
      return withCors(ApiResponse.error('Company ID is required', 400), origin)
    }

    if (user.role !== 'SUPER_ADMIN' && companyId !== user.companyId) {
      return withCors(ApiResponse.forbidden('You do not have access to this company'), origin)
    }

    const settings = await prisma.aiAssistantSettings.findUnique({
      where: { companyId },
      select: {
        id: true,
        enabled: true,
        provider: true,
        model: true,
        keyLast4: true,
        keyStatus: true,
        lastTestedAt: true,
        visibleCategories: true,
        monthlyWarning: true,
        hourlyLimit: true,
        dailyLimit: true,
        updatedById: true,
        updatedByName: true,
        updatedAt: true,
      },
    })

    const platform = await prisma.aiAssistantPlatform.findUnique({ where: { id: 'global' } })
    const terms = await termsStatus(prisma, companyId)

    // This month's estimated cost (logged token counts x the model's rates) and number of replies, for the Usage section.
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    const logs = await prisma.aIUsageLog.findMany({ where: { companyId, service: 'assistant', createdAt: { gte: monthStart } }, select: { model: true, inputLength: true, outputLength: true, metadata: true } })
    const answered = logs.filter((l) => !isRefused(l.metadata))
    const ok = answered.filter((l) => !isFailed(l.metadata))
    const usage = { monthEstimate: Number(estimateCost(ok).toFixed(4)), replies: ok.length, failed: answered.length - ok.length }

    return withCors(
      ApiResponse.success({
        settings: settings ?? {
          enabled: false,
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          keyLast4: null,
          keyStatus: 'none',
          lastTestedAt: null,
          visibleCategories: [],
          monthlyWarning: null,
          hourlyLimit: 20,
          dailyLimit: 500,
        },
        platformEnabled: platform?.enabled ?? true,
        terms,
        usage,
      }),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

const SENSITIVE_CATEGORIES = ['compensation', 'health', 'disciplinary', 'next_of_kin', 'leave', 'address', 'personal']

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const guard = await aiGuard(request, companyId, prisma, { requireConnected: false })
    if (isGuardError(guard)) return guard

    // Super Admin can look at a company's settings (GET) but only the company's own Admin or HR change them. Super Admin's lever is the kill switch.
    if (guard.user.role !== 'ADMIN' && guard.user.role !== 'HR') {
      return withCors(ApiResponse.forbidden('Only the company\'s Admin or HR can update AI Assistant settings'), origin)
    }

    const body = await request.json()
    const { enabled, provider, model, visibleCategories, monthlyWarning, hourlyLimit, dailyLimit, confirm } = body

    if (provider !== undefined && provider !== 'anthropic' && provider !== 'openai') {
      return withCors(ApiResponse.error('provider must be anthropic or openai', 400), origin)
    }
    if (model !== undefined) {
      const info = getModelInfo(String(model))
      if (!info || (provider !== undefined ? info.provider !== provider : guard.settings?.provider && info.provider !== guard.settings.provider)) {
        return withCors(ApiResponse.error('That model is not available for the chosen provider', 400), origin)
      }
    }
    const wholeBetween = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
    if (hourlyLimit !== undefined && !wholeBetween(hourlyLimit, 1, 200)) {
      return withCors(ApiResponse.error('The hourly limit must be a whole number from 1 to 200', 400), origin)
    }
    if (dailyLimit !== undefined && !wholeBetween(dailyLimit, 10, 5000)) {
      return withCors(ApiResponse.error('The daily limit must be a whole number from 10 to 5000', 400), origin)
    }

    if (visibleCategories && Array.isArray(visibleCategories)) {
      const ALWAYS_HIDDEN = ['identity', 'bank']
      const forbidden = visibleCategories.filter((c: string) => ALWAYS_HIDDEN.includes(c))
      if (forbidden.length) {
        return withCors(
          ApiResponse.error(`These categories cannot be made visible: ${forbidden.join(', ')}`, 400),
          origin,
        )
      }

      const existing = guard.settings?.visibleCategories as string[] ?? []
      const newSensitive = visibleCategories.filter(
        (c: string) => SENSITIVE_CATEGORIES.includes(c) && !existing.includes(c),
      )
      if (newSensitive.length && !confirm) {
        return withCors(
          ApiResponse.error(
            `Making sensitive categories visible requires confirmation. Categories: ${newSensitive.join(', ')}`,
            400,
            [],
            { requiresConfirm: true, sensitiveCategories: newSensitive },
          ),
          origin,
        )
      }
    }

    const before = await prisma.aiAssistantSettings.findUnique({ where: { companyId: guard.companyId } })

    const data: Record<string, unknown> = {
      updatedById: guard.user.userId,
      updatedByName: guard.user.email,
    }
    if (enabled !== undefined) data.enabled = Boolean(enabled)
    if (provider !== undefined) data.provider = String(provider)
    if (model !== undefined) data.model = String(model)
    if (visibleCategories !== undefined) data.visibleCategories = visibleCategories
    if (monthlyWarning !== undefined) data.monthlyWarning = monthlyWarning === null ? null : Number(monthlyWarning)
    if (hourlyLimit !== undefined) data.hourlyLimit = hourlyLimit
    if (dailyLimit !== undefined) data.dailyLimit = dailyLimit

    const updated = await prisma.aiAssistantSettings.upsert({
      where: { companyId: guard.companyId },
      update: data,
      create: {
        companyId: guard.companyId,
        ...data,
        enabled: (data.enabled as boolean) ?? false,
        provider: (data.provider as string) ?? 'anthropic',
        model: (data.model as string) ?? 'claude-sonnet-5-5',
        visibleCategories: (data.visibleCategories as unknown) ?? [],
      },
      select: {
        id: true,
        enabled: true,
        provider: true,
        model: true,
        keyLast4: true,
        keyStatus: true,
        lastTestedAt: true,
        visibleCategories: true,
        monthlyWarning: true,
        hourlyLimit: true,
        dailyLimit: true,
        updatedById: true,
        updatedByName: true,
        updatedAt: true,
      },
    })

    const actor = await actorFor(guard.user)
    const changes = diffFields(
      before ? { enabled: before.enabled, provider: before.provider, model: before.model, visibleCategories: JSON.stringify(before.visibleCategories), monthlyWarning: before.monthlyWarning, hourlyLimit: before.hourlyLimit, dailyLimit: before.dailyLimit } : {},
      { enabled: updated.enabled, provider: updated.provider, model: updated.model, visibleCategories: JSON.stringify(updated.visibleCategories), monthlyWarning: updated.monthlyWarning, hourlyLimit: updated.hourlyLimit, dailyLimit: updated.dailyLimit },
    )

    if (changes.length) {
      await recordCoreSetupEvent(prisma, {
        companyId: guard.companyId,
        actor,
        kind: 'setting',
        area: 'ai',
        action: 'AI Assistant settings updated',
        summary: `Updated: ${changes.map((c) => c.field).join(', ')}`,
        fieldChanges: changes,
      })
    }

    return withCors(ApiResponse.success(updated, 'Settings updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
