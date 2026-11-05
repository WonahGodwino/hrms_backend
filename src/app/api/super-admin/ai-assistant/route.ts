// [ai-assistant] Super Admin platform off-switch — GET and PATCH.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { actorFor, recordCoreSetupEvent } from '@/app/lib/core-setup/audit'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    requireRole(token, ['SUPER_ADMIN'])

    const platform = await prisma.aiAssistantPlatform.findUnique({ where: { id: 'global' } })

    return withCors(
      ApiResponse.success({ enabled: platform?.enabled ?? true }),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PATCH(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN'])

    const body = await req.json()
    const { enabled } = body

    if (typeof enabled !== 'boolean') {
      return withCors(ApiResponse.error('enabled must be a boolean', 400), origin)
    }

    const platform = await prisma.aiAssistantPlatform.upsert({
      where: { id: 'global' },
      update: { enabled },
      create: { id: 'global', enabled },
    })

    // The audit table is per company, so a platform-wide change is recorded under the Super Admin's own company when they have one.
    // It never fails the switch itself.
    if (user.companyId) {
      const actor = await actorFor(user)
      await recordCoreSetupEvent(prisma, {
        companyId: user.companyId,
        actor,
        kind: 'setting',
        area: 'ai',
        action: enabled ? 'AI Assistant platform enabled' : 'AI Assistant platform disabled',
        summary: `Platform-wide AI Assistant ${enabled ? 'enabled' : 'disabled'} by ${actor.name}.`,
      }).catch(() => null)
    }

    return withCors(
      ApiResponse.success(
        { enabled: platform.enabled },
        `AI Assistant ${enabled ? 'enabled' : 'disabled'}`,
      ),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
