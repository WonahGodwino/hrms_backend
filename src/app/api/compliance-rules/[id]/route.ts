import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// PUT /api/compliance-rules/:id
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
      where: { id: params.id, companyId, ruleType: 'compliance' },
    })

    if (!rule) {
      return withCors(ApiResponse.error('Compliance rule not found', 404), origin)
    }

    const {
      title,
      enabled,
      trainingProgramId,
      applicableTraining,
      targetAudience,
      requirementLevel,
      enforcementLevel,
      deadlinePolicy,
      deadlinePolicyLabel,
      graceDays,
      actions,
      syncDashboard,
      includeReviews,
      auditLogs,
    } = body

    const existingCond = (rule.condition as any) || {}
    const updatedCond = {
      ...existingCond,
      ...(requirementLevel !== undefined && { requirementLevel }),
      ...(deadlinePolicy !== undefined && { deadlinePolicy }),
      ...(deadlinePolicyLabel !== undefined && { deadlinePolicyLabel }),
      ...(syncDashboard !== undefined && { syncDashboard: Boolean(syncDashboard) }),
      ...(includeReviews !== undefined && { includeReviews: Boolean(includeReviews) }),
      ...(auditLogs !== undefined && { auditLogs: Boolean(auditLogs) }),
    }

    const updated = await prisma.assignmentRule.update({
      where: { id: rule.id },
      data: {
        ...(title !== undefined && { name: title }),
        ...(enabled !== undefined && { enabled: Boolean(enabled) }),
        ...(trainingProgramId !== undefined && { trainingProgramId }),
        ...(enforcementLevel !== undefined && { priority: enforcementLevel }),
        ...(targetAudience !== undefined && { scope: targetAudience }),
        ...(graceDays !== undefined && { graceDays: parseInt(String(graceDays), 10) }),
        ...(actions !== undefined && { statusHandling: actions }),
        condition: updatedCond,
      },
      include: {
        trainingProgram: { select: { id: true, programName: true } },
      },
    })

    const cond = (updated.condition as any) || {}
    const data = {
      id: updated.id,
      title: updated.name,
      enabled: updated.enabled,
      trainingProgramId: updated.trainingProgramId,
      trainingName: updated.trainingProgram?.programName ?? updated.name,
      applicableTraining: updated.trainingProgram?.programName ?? updated.name,
      targetAudience: updated.scope,
      requirementLevel: cond.requirementLevel,
      enforcementLevel: updated.priority,
      deadlinePolicy: cond.deadlinePolicy,
      deadlinePolicyLabel: cond.deadlinePolicyLabel,
      graceDays: updated.graceDays,
      actions: updated.statusHandling,
      syncDashboard: cond.syncDashboard,
      includeReviews: cond.includeReviews,
      auditLogs: cond.auditLogs,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }

    return withCors(ApiResponse.success(data, 'Compliance rule updated'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// DELETE /api/compliance-rules/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const resolved = await resolveRequestCompanyId(user, new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const rule = await prisma.assignmentRule.findFirst({
      where: { id: params.id, companyId, ruleType: 'compliance' },
    })

    if (!rule) {
      return withCors(ApiResponse.error('Compliance rule not found', 404), origin)
    }

    await prisma.assignmentRule.delete({ where: { id: rule.id } })

    return withCors(ApiResponse.success(null, 'Compliance rule deleted'), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
