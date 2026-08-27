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

// GET /api/assignment-rules?companyId=&ruleType=&enabled=
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const ruleType  = searchParams.get('ruleType')
    const enabled   = searchParams.get('enabled')

    const where: any = { companyId }
    if (ruleType) where.ruleType = ruleType
    if (enabled !== null) where.enabled = enabled !== 'false'

    const rules = await prisma.assignmentRule.findMany({
      where,
      include: {
        trainingProgram: { select: { id: true, programName: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return withCors(ApiResponse.success(rules), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/assignment-rules
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const {
      companyId, name, ruleType, trigger, condition, trainingProgramId,
      recurrenceValue, recurrenceUnit, startOption, endOption, graceDays,
      priority, scope, notifyOnAssignment, statusHandling, escalateManager,
      preExpiryNotifications,
    } = body

    const resolved = await resolveRequestCompanyId(user, companyId)
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId: cid } = resolved

    if (!name || !ruleType)
      return withCors(ApiResponse.error('name and ruleType are required', 400), origin)

    // Validate the linked training program belongs to this company
    if (trainingProgramId) {
      const prog = await prisma.trainingProgram.findFirst({
        where: { id: trainingProgramId, companyId: cid, deletedAt: null },
        select: { id: true },
      })
      if (!prog) return withCors(ApiResponse.error('Training program not found', 404), origin)
    }

    const rule = await prisma.assignmentRule.create({
      data: {
        companyId: cid, name, ruleType, trigger, condition, trainingProgramId,
        enabled: true,
        recurrenceValue, recurrenceUnit, startOption, endOption,
        graceDays: graceDays ?? 7,
        priority: priority ?? 'Medium',
        scope: scope ?? 'All Employees',
        notifyOnAssignment: notifyOnAssignment ?? true,
        statusHandling: statusHandling ?? [],
        escalateManager: escalateManager ?? false,
        preExpiryNotifications: preExpiryNotifications ?? [],
        createdBy: user.userId,
      },
    })

    const actor = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true },
    })
    await logAssignmentRuleActivity({
      companyId: cid,
      actorId: user.userId,
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : 'System',
      action: 'CREATED',
      rule,
      logicLines: condition ? [`IF ${JSON.stringify(condition)}`, `THEN ${trigger ?? 'assign_training'}`] : [],
    })

    return withCors(ApiResponse.success(rule, 'Assignment rule created', 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
