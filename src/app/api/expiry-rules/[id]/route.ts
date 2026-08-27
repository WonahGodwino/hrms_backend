import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PUT /api/expiry-rules/:id
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()

    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId, ruleType: 'expiry_reassignment' },
    })

    if (!rule) {
      return withCors(ApiResponse.error('Expiry rule not found', 404), origin)
    }

    const {
      trainingProgramId,
      trainingName,
      durationValue,
      durationUnit,
      trigger,
      triggerLogic,
      graceDays,
      scope,
      statusHandling,
      preExpiryNotifications,
      escalateManager,
      active,
    } = body

    const updated = await prisma.assignmentRule.update({
      where: { id: rule.id },
      data: {
        ...(trainingName !== undefined && { name: trainingName }),
        ...(trainingProgramId !== undefined && { trainingProgramId }),
        ...(triggerLogic !== undefined && { trigger: triggerLogic }),
        ...(trigger !== undefined && { trigger }),
        ...(active !== undefined && { enabled: active }),
        ...(durationValue !== undefined && { recurrenceValue: parseInt(String(durationValue), 10) }),
        ...(durationUnit !== undefined && { recurrenceUnit: durationUnit }),
        ...(graceDays !== undefined && { graceDays: parseInt(String(graceDays), 10) }),
        ...(scope !== undefined && { scope }),
        ...(statusHandling !== undefined && { statusHandling }),
        ...(escalateManager !== undefined && { escalateManager: Boolean(escalateManager) }),
        ...(preExpiryNotifications !== undefined && {
          preExpiryNotifications: Array.isArray(preExpiryNotifications)
            ? preExpiryNotifications.map((n) => (typeof n === 'number' ? n : parseInt(n, 10) || 30))
            : [],
        }),
      },
      include: {
        trainingProgram: { select: { id: true, programName: true } },
      },
    })

    const data = {
      id: updated.id,
      trainingProgramId: updated.trainingProgramId,
      trainingName: updated.trainingProgram?.programName ?? updated.name,
      training: updated.trainingProgram?.programName ?? updated.name,
      durationValue: updated.recurrenceValue,
      durationUnit: updated.recurrenceUnit,
      trigger: updated.trigger,
      triggerLogic: updated.trigger,
      graceDays: updated.graceDays,
      scope: updated.scope,
      statusHandling: updated.statusHandling,
      preExpiryNotifications: updated.preExpiryNotifications,
      reassignmentBehavior: 'Auto-reassign same training',
      escalateManager: updated.escalateManager,
      active: updated.enabled,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return withCors(ApiResponse.success(data, 'Expiry rule updated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// DELETE /api/expiry-rules/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId, ruleType: 'expiry_reassignment' },
    })

    if (!rule) {
      return withCors(ApiResponse.error('Expiry rule not found', 404), origin)
    }

    await prisma.assignmentRule.delete({ where: { id: rule.id } })

    return withCors(ApiResponse.success(null, 'Expiry rule deleted'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
