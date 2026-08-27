import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
import { logAssignmentRuleActivity } from '@/app/lib/training/assignment-rule-audit'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PUT /api/assignment-rules/[id]
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId: resolved.companyId },
    })
    if (!rule) return withCors(ApiResponse.error('Assignment rule not found', 404), origin)

    const updated = await prisma.assignmentRule.update({
      where: { id: params.id },
      data: {
        ...(body.name                   !== undefined && { name: body.name }),
        ...(body.ruleType               !== undefined && { ruleType: body.ruleType }),
        ...(body.trigger                !== undefined && { trigger: body.trigger }),
        ...(body.condition              !== undefined && { condition: body.condition }),
        ...(body.trainingProgramId      !== undefined && { trainingProgramId: body.trainingProgramId }),
        ...(body.recurrenceValue        !== undefined && { recurrenceValue: body.recurrenceValue }),
        ...(body.recurrenceUnit         !== undefined && { recurrenceUnit: body.recurrenceUnit }),
        ...(body.startOption            !== undefined && { startOption: body.startOption }),
        ...(body.endOption              !== undefined && { endOption: body.endOption }),
        ...(body.graceDays              !== undefined && { graceDays: body.graceDays }),
        ...(body.priority               !== undefined && { priority: body.priority }),
        ...(body.scope                  !== undefined && { scope: body.scope }),
        ...(body.notifyOnAssignment     !== undefined && { notifyOnAssignment: body.notifyOnAssignment }),
        ...(body.statusHandling         !== undefined && { statusHandling: body.statusHandling }),
        ...(body.escalateManager        !== undefined && { escalateManager: body.escalateManager }),
        ...(body.preExpiryNotifications !== undefined && { preExpiryNotifications: body.preExpiryNotifications }),
      },
    })

    const actor = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true },
    })
    await logAssignmentRuleActivity({
      companyId: resolved.companyId,
      actorId: user.userId,
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : 'System',
      action: 'UPDATED',
      rule: updated,
    })

    return withCors(ApiResponse.success(updated, 'Assignment rule updated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// DELETE /api/assignment-rules/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId: resolved.companyId },
    })
    if (!rule) return withCors(ApiResponse.error('Assignment rule not found', 404), origin)

    await prisma.assignmentRule.delete({ where: { id: params.id } })

    const actor = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true },
    })
    await logAssignmentRuleActivity({
      companyId: resolved.companyId,
      actorId: user.userId,
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : 'System',
      action: 'DELETED',
      rule,
    })

    return withCors(ApiResponse.success(null, 'Assignment rule deleted'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
