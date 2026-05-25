import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'

import { requireRole } from '@/app/lib/auth'
import { requireModuleAccess } from '@/app/lib/module-access'
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
    const companyId = searchParams.get('companyId') ?? user.companyId
    const ruleType  = searchParams.get('ruleType')
    const enabled   = searchParams.get('enabled')

    if (!companyId) return withCors(ApiResponse.error('companyId is required', 400), origin)
    if (user.companyId && companyId !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

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

    const cid = companyId ?? user.companyId
    if (!cid || !name || !ruleType)
      return withCors(ApiResponse.error('companyId, name, ruleType are required', 400), origin)
    if (user.companyId && cid !== user.companyId)
      return withCors(ApiResponse.error('Access denied', 403), origin)

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

    return withCors(ApiResponse.success(rule, 'Assignment rule created', 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
