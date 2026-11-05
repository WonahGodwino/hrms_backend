// [ai-assistant] Authentication and role guard for AI Assistant routes.
import { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getUserFromToken, checkCompanyAccess, type AuthUser } from '@/app/lib/auth'
import { ApiResponse } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'
import { isPlatformEnabled } from './flags'

const ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR']

export type RefusalReason = 'role_not_allowed' | 'wrong_company' | 'assistant_off' | 'not_connected' | 'rate_limited'

// A refused request is counted by reason (no content, no message) so the 247HR team can spot confusing settings. Never blocks the refusal.
export async function logRefusal(prisma: PrismaClient, companyId: string | null | undefined, userId: string | undefined, reason: RefusalReason) {
  if (!companyId) return
  try {
    await prisma.aIUsageLog.create({
      data: {
        companyId, service: 'assistant', endpoint: 'assistant', model: 'none',
        tokensUsed: 0, cost: 0, inputLength: 0, outputLength: 0,
        metadata: { userId, status: 'refused', reason },
      },
    })
  } catch {
    /* counting a refusal must never change the refusal */
  }
}

export interface AiGuardResult {
  user: AuthUser
  companyId: string
  settings: {
    enabled: boolean
    provider: string
    model: string
    keyStatus: string
    visibleCategories: unknown
    apiKeyEncrypted: string | null
    monthlyWarning: number | null
    hourlyLimit: number
    dailyLimit: number
  } | null
}

// requireConnected: false is for features that sit beside the assistant but do not call a model (the custom rule builder): the feature
// flag, role and platform switch still apply, but the company does not need to have connected an API key.
export async function aiGuard(
  req: NextRequest,
  companyId: string | null,
  prisma: PrismaClient,
  options: { requireConnected?: boolean } = {},
): Promise<AiGuardResult | Response> {
  const origin = req.headers.get('origin')

  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return withCors(ApiResponse.error('Authorization header missing', 401), origin)
  }

  const token = authHeader.replace('Bearer ', '')
  const user = await getUserFromToken(token)

  if (!user) {
    return withCors(ApiResponse.error('Invalid or expired token', 401), origin)
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    await logRefusal(prisma, user.companyId, user.userId, 'role_not_allowed')
    return withCors(ApiResponse.forbidden('You do not have access to the AI Assistant'), origin)
  }

  const resolvedCompanyId = companyId?.trim() || user.companyId
  if (!resolvedCompanyId) {
    return withCors(ApiResponse.error('Company ID is required', 400), origin)
  }

  // Admins and HR can be assigned to several companies; the developer's helper knows those assignments (Super Admin may use any).
  if (user.role !== 'SUPER_ADMIN' && resolvedCompanyId !== user.companyId) {
    const allowed = await checkCompanyAccess(user.userId, resolvedCompanyId, user.role)
    if (!allowed) {
      await logRefusal(prisma, user.companyId, user.userId, 'wrong_company')
      return withCors(ApiResponse.forbidden('You do not have access to this company'), origin)
    }
  }

  const platformOn = await isPlatformEnabled(prisma)
  if (!platformOn) {
    await logRefusal(prisma, resolvedCompanyId, user.userId, 'assistant_off')
    return withCors(
      ApiResponse.error('The AI Assistant has been disabled by a Super Admin', 409, [], { code: 'ASSISTANT_OFF' }),
      origin,
    )
  }

  const settings = await prisma.aiAssistantSettings.findUnique({
    where: { companyId: resolvedCompanyId },
    select: {
      enabled: true,
      provider: true,
      model: true,
      keyStatus: true,
      visibleCategories: true,
      apiKeyEncrypted: true,
      monthlyWarning: true,
      hourlyLimit: true,
      dailyLimit: true,
    },
  })

  // The company's own switch comes first, so the message says why: switched off, or switched on but no working key.
  if (!settings?.enabled && options.requireConnected !== false) {
    await logRefusal(prisma, resolvedCompanyId, user.userId, 'assistant_off')
    return withCors(
      ApiResponse.error(
        'The AI Assistant is switched off for this company. An Admin or HR can switch it on in Settings.',
        409,
        [],
        { code: 'ASSISTANT_OFF_FOR_COMPANY' },
      ),
      origin,
    )
  }

  const companyConnected = settings?.enabled && settings.keyStatus === 'ok'
  if (!companyConnected && options.requireConnected !== false) {
    await logRefusal(prisma, resolvedCompanyId, user.userId, 'not_connected')
    return withCors(
      ApiResponse.error(
        'The AI Assistant is not connected for this company. An Admin or HR must add an API key in Settings.',
        409,
        [],
        { code: 'ASSISTANT_NOT_CONNECTED' },
      ),
      origin,
    )
  }

  return { user, companyId: resolvedCompanyId, settings }
}

export function isGuardError(result: AiGuardResult | Response): result is Response {
  return result instanceof Response
}
