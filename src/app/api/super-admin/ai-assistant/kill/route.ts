// [ai-assistant] Super Admin kill switch — POST turns the assistant off for one company, or for every company.
//
// For platform safety (for example a provider incident). Turning a company back on is left to that company's Admin or HR; the
// platform-wide switch is turned back on from the platform toggle (PATCH /api/super-admin/ai-assistant).
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { actorFor, recordCoreSetupEvent } from '@/app/lib/core-setup/audit'

const KILLED_TYPE = 'AI_ASSISTANT_OFF'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {

    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = requireRole(token, ['SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const all = body.all === true
    const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : ''
    const reason = typeof body.reason === 'string' ? body.reason.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 300) : ''
    if (all === Boolean(companyId)) {
      return withCors(ApiResponse.error('Send either { "all": true } or { "companyId": "..." }', 400), origin)
    }

    const actor = await actorFor(user)
    const note = reason ? ` Reason: ${reason}` : ''

    if (all) {
      await prisma.aiAssistantPlatform.upsert({ where: { id: 'global' }, update: { enabled: false }, create: { id: 'global', enabled: false } })
      if (user.companyId) {
        await recordCoreSetupEvent(prisma, {
          companyId: user.companyId, actor, kind: 'setting', area: 'ai', action: 'AI Assistant turned off for every company',
          summary: `Turned off for every company by ${actor.name}.${note}`,
        }).catch(() => null)
      }
      return withCors(ApiResponse.success({ scope: 'all', enabled: false }, 'AI Assistant turned off for every company'), origin)
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
    if (!company) return withCors(ApiResponse.notFound('Company not found'), origin)

    const { count } = await prisma.aiAssistantSettings.updateMany({ where: { companyId, enabled: true }, data: { enabled: false, updatedById: user.userId, updatedByName: actor.name } })
    if (count) {
      await recordCoreSetupEvent(prisma, {
        companyId, actor, kind: 'setting', area: 'ai', action: 'AI Assistant turned off by Super Admin',
        summary: `Turned off by ${actor.name} for platform safety.${note}`,
      }).catch(() => null)
      const people = await prisma.staffRecord.findMany({ where: { companyId, isActive: true, role: { in: ['ADMIN', 'HR'] } }, select: { id: true } })
      for (const p of people) {
        await prisma.notification
          .create({
            data: {
              userId: p.id, companyId, type: KILLED_TYPE, title: 'The AI Assistant was turned off',
              message: `A Super Admin turned the AI Assistant off for your company.${note} You can turn it back on in Settings > AI Assistant once it is safe to do so.`,
              data: { at: new Date().toISOString() },
            },
          })
          .catch(() => null)
      }
    }
    return withCors(ApiResponse.success({ scope: 'company', companyId, enabled: false, changed: count > 0 }, count ? 'AI Assistant turned off for the company' : 'It was already off for this company'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}