import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
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

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId: user.companyId },
    })
    if (!rule) return withCors(ApiResponse.error('Assignment rule not found', 404), origin)

    const body = await req.json()
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

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId: user.companyId },
    })
    if (!rule) return withCors(ApiResponse.error('Assignment rule not found', 404), origin)

    await prisma.assignmentRule.delete({ where: { id: params.id } })
    return withCors(ApiResponse.success(null, 'Assignment rule deleted'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
