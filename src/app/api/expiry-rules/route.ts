import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/expiry-rules
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const { searchParams } = new URL(req.url)
    const resolved = await resolveRequestCompanyId(user, searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
    const search = searchParams.get('search')?.trim()

    const where: any = {
      companyId,
      ruleType: 'expiry_reassignment',
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { trainingProgram: { programName: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [total, rules] = await Promise.all([
      prisma.assignmentRule.count({ where }),
      prisma.assignmentRule.findMany({
        where,
        include: {
          trainingProgram: { select: { id: true, programName: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const items = rules.map((r) => ({
      id: r.id,
      trainingProgramId: r.trainingProgramId,
      trainingName: r.trainingProgram?.programName ?? r.name,
      training: r.trainingProgram?.programName ?? r.name,
      durationValue: r.recurrenceValue ?? 12,
      durationUnit: r.recurrenceUnit ?? 'Months',
      trigger: r.trigger ?? 'Post-Completion',
      triggerLogic: r.trigger ?? 'After Completion Date',
      graceDays: r.graceDays,
      scope: r.scope,
      statusHandling: r.statusHandling,
      preExpiryNotifications: r.preExpiryNotifications,
      reassignmentBehavior: 'Auto-reassign same training',
      escalateManager: r.escalateManager,
      active: r.enabled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))

    return withCors(
      ApiResponse.success({
        items,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1,
      }),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}

// POST /api/expiry-rules
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const {
      companyId: requestedCompanyId,
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

    const resolved = await resolveRequestCompanyId(
      user,
      requestedCompanyId ?? new URL(req.url).searchParams.get('companyId'),
    )
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    let programId = trainingProgramId
    let name = trainingName || 'Expiry Rule'

    if (programId) {
      const prog = await prisma.trainingProgram.findFirst({
        where: { id: programId, companyId, deletedAt: null },
        select: { id: true, programName: true },
      })
      if (prog) {
        name = prog.programName
      }
    }

    const rule: any = await prisma.assignmentRule.create({
      data: {
        companyId,
        name,
        ruleType: 'expiry_reassignment',
        trainingProgramId: programId || null,
        trigger: triggerLogic || trigger || 'Post-Completion',
        enabled: active !== undefined ? active : true,
        recurrenceValue: durationValue ? parseInt(String(durationValue), 10) : 12,
        recurrenceUnit: durationUnit || 'Months',
        graceDays: graceDays ? parseInt(String(graceDays), 10) : 7,
        scope: scope || 'All Employees',
        statusHandling: Array.isArray(statusHandling) ? statusHandling : [],
        escalateManager: Boolean(escalateManager),
        preExpiryNotifications: Array.isArray(preExpiryNotifications)
          ? preExpiryNotifications.map((n) => (typeof n === 'number' ? n : parseInt(n, 10) || 30))
          : [30, 14, 7],
        createdBy: user.userId,
      },
      include: {
        trainingProgram: { select: { id: true, programName: true } },
      },
    })

    const data = {
      id: rule.id,
      trainingProgramId: rule.trainingProgramId,
      trainingName: rule.trainingProgram?.programName ?? rule.name,
      training: rule.trainingProgram?.programName ?? rule.name,
      durationValue: rule.recurrenceValue,
      durationUnit: rule.recurrenceUnit,
      trigger: rule.trigger,
      triggerLogic: rule.trigger,
      graceDays: rule.graceDays,
      scope: rule.scope,
      statusHandling: rule.statusHandling,
      preExpiryNotifications: rule.preExpiryNotifications,
      reassignmentBehavior: 'Auto-reassign same training',
      escalateManager: rule.escalateManager,
      active: rule.enabled,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }

    return withCors(ApiResponse.success(data, 'Expiry rule created', 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
