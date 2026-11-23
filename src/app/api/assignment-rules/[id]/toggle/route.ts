import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { logAssignmentRuleActivity } from '@/app/lib/training/assignment-rule-audit'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { forCompany } from '@/app/lib/data/tenant'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PATCH /api/assignment-rules/:id/toggle
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const rule = await forCompany(resolved.companyId).assignmentRule.findFirst({
      where: { id: params.id },
    })

    if (!rule) {
      return withCors(ApiResponse.error('Assignment rule not found', 404), origin)
    }

    const newEnabled = body.enabled !== undefined ? Boolean(body.enabled) : !rule.enabled

    const updated = await prisma.assignmentRule.update({
      where: { id: rule.id },
      data: { enabled: newEnabled },
    })

    const actor = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true },
    })
    await logAssignmentRuleActivity({
      companyId: resolved.companyId,
      actorId: user.userId,
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : 'System',
      action: newEnabled ? 'ENABLED' : 'DISABLED',
      rule: updated,
    })

    return withCors(
      ApiResponse.success(updated, `Assignment rule ${newEnabled ? 'enabled' : 'disabled'}`),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
