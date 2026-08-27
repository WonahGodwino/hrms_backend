import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// GET /api/compliance-rules
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
      ruleType: 'compliance',
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

    const items = rules.map((r) => {
      const cond = (r.condition as any) || {}
      return {
        id: r.id,
        title: r.name,
        enabled: r.enabled,
        trainingProgramId: r.trainingProgramId,
        trainingName: r.trainingProgram?.programName ?? r.name,
        applicableTraining: r.trainingProgram?.programName ?? r.name,
        targetAudience: r.scope || 'All Employees',
        requirementLevel: cond.requirementLevel || 'Mandatory',
        enforcementLevel: r.priority || 'Moderate',
        deadlinePolicy: cond.deadlinePolicy || 'due_date',
        deadlinePolicyLabel: cond.deadlinePolicyLabel || 'Complete by Due Date',
        graceDays: r.graceDays,
        actions: r.statusHandling || ['notify', 'restrict'],
        syncDashboard: cond.syncDashboard ?? true,
        includeReviews: cond.includeReviews ?? true,
        auditLogs: cond.auditLogs ?? true,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }
    })

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

// POST /api/compliance-rules
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json()
    const {
      companyId: requestedCompanyId,
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

    const resolved = await resolveRequestCompanyId(
      user,
      requestedCompanyId ?? new URL(req.url).searchParams.get('companyId'),
    )
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    let programId = trainingProgramId
    let name = title || applicableTraining || 'Compliance Rule'

    if (programId) {
      const prog = await prisma.trainingProgram.findFirst({
        where: { id: programId, companyId, deletedAt: null },
        select: { id: true, programName: true },
      })
      if (prog) {
        name = title || prog.programName
      }
    }

    const rule: any = await prisma.assignmentRule.create({
      data: {
        companyId,
        name,
        ruleType: 'compliance',
        trainingProgramId: programId || null,
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        priority: enforcementLevel || 'Moderate',
        scope: targetAudience || 'All Employees',
        graceDays: graceDays ? parseInt(String(graceDays), 10) : 7,
        statusHandling: Array.isArray(actions) ? actions : ['notify', 'restrict'],
        condition: {
          requirementLevel: requirementLevel || 'Mandatory',
          deadlinePolicy: deadlinePolicy || 'due_date',
          deadlinePolicyLabel: deadlinePolicyLabel || 'Complete by Due Date',
          syncDashboard: syncDashboard !== undefined ? Boolean(syncDashboard) : true,
          includeReviews: includeReviews !== undefined ? Boolean(includeReviews) : true,
          auditLogs: auditLogs !== undefined ? Boolean(auditLogs) : true,
        },
        createdBy: user.userId,
      },
      include: {
        trainingProgram: { select: { id: true, programName: true } },
      },
    })

    const cond = (rule.condition as any) || {}
    const data = {
      id: rule.id,
      title: rule.name,
      enabled: rule.enabled,
      trainingProgramId: rule.trainingProgramId,
      trainingName: rule.trainingProgram?.programName ?? rule.name,
      applicableTraining: rule.trainingProgram?.programName ?? rule.name,
      targetAudience: rule.scope,
      requirementLevel: cond.requirementLevel,
      enforcementLevel: rule.priority,
      deadlinePolicy: cond.deadlinePolicy,
      deadlinePolicyLabel: cond.deadlinePolicyLabel,
      graceDays: rule.graceDays,
      actions: rule.statusHandling,
      syncDashboard: cond.syncDashboard,
      includeReviews: cond.includeReviews,
      auditLogs: cond.auditLogs,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    }

    return withCors(ApiResponse.success(data, 'Compliance rule created', 201), origin)
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
