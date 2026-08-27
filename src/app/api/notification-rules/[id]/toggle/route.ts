import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PATCH /api/notification-rules/:id/toggle
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId, ruleType: 'notification' },
    })

    if (!rule) {
      return withCors(ApiResponse.error('Notification rule not found', 404), origin)
    }

    const newActive = body.active !== undefined ? Boolean(body.active) : !rule.enabled

    const updated = await prisma.assignmentRule.update({
      where: { id: rule.id },
      data: { enabled: newActive },
    })

    return withCors(
      ApiResponse.success(
        { id: updated.id, active: updated.enabled },
        `Notification rule ${newActive ? 'activated' : 'deactivated'}`
      ),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
