import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { mapActivityLog } from '@/app/lib/training/activity-log-map'
import { isCompanyError, resolveRequestCompanyId } from '@/app/lib/training/resolve-company'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}

// POST /api/training/assignment-rules/activity-logs/:id/retry
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get('origin')
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? null
    const user = await requireModuleAccess(token, 'TRAINING', ['HR', 'ADMIN', 'SUPER_ADMIN'])

    const body = await req.json().catch(() => ({}))
    const resolved = await resolveRequestCompanyId(user, body.companyId ?? new URL(req.url).searchParams.get('companyId'))
    if (isCompanyError(resolved)) return withCors(ApiResponse.error(resolved.error.message, resolved.error.status), origin)
    const { companyId } = resolved

    const log = await prisma.trainingAuditLog.findFirst({
      where: { id: params.id, companyId, entityType: 'assignment_rule' },
      include: { actor: { select: { firstName: true, lastName: true } } },
    })

    if (!log) {
      return withCors(ApiResponse.error('Activity log not found', 404), origin)
    }

    const meta = (log.metadata ?? {}) as Record<string, any>

    if (meta.status !== 'FAILED') {
      return withCors(
        ApiResponse.error('This event cannot be retried. Only failed events are retryable.', 409),
        origin
      )
    }

    const employeeIds: string[] = meta.affectedEmployeeIds ?? []
    const trainingProgramId: string | null = meta.trainingProgramId ?? null

    if (meta.type !== 'ASSIGNMENT' || !trainingProgramId || employeeIds.length === 0) {
      return withCors(
        ApiResponse.error('This event cannot be retried. No retryable assignment action was recorded.', 409),
        origin
      )
    }

    const program = await prisma.trainingProgram.findFirst({
      where: { id: trainingProgramId, companyId, deletedAt: null },
    })

    if (!program) {
      return withCors(ApiResponse.error('The training program for this event no longer exists.', 409), origin)
    }

    const created = await prisma.participantProgress.createMany({
      data: employeeIds.map((employeeId) => ({
        companyId,
        trainingProgramId,
        employeeId,
        trainingStatus: 'NOT STARTED',
        dueDate: program.dueDate,
      })),
      skipDuplicates: true,
    })

    const actor = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { firstName: true, lastName: true },
    })
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : 'System'

    const retryLog = await prisma.trainingAuditLog.create({
      data: {
        companyId,
        actorId: user.userId,
        action: 'RETRY',
        entityType: 'assignment_rule',
        entityId: log.entityId,
        metadata: {
          status: 'SUCCESS',
          type: 'ASSIGNMENT',
          ruleName: meta.ruleName ?? 'Unknown Rule',
          triggeredBy: `${actorName} (Manual retry)`,
          target: `${created.count} employee${created.count === 1 ? '' : 's'}`,
          ruleType: meta.ruleType ?? 'Assignment Workflow',
          triggerSource: 'Manual',
          durationMs: 0,
          logicLines: meta.logicLines ?? [],
          affectedEmployees: meta.affectedEmployees ?? [],
          affectedEmployeeIds: employeeIds,
          trainingProgramId,
          actions: [{ label: 'Retry Executed', time: new Date().toISOString(), kind: 'check' }],
          timeline: [
            ...(meta.timeline ?? []),
            { title: 'Retry Executed', subtitle: `${created.count} assignment(s) created by ${actorName}` },
          ],
          debug: [`Retried event ${log.id}`, `Created ${created.count} participant record(s)`],
          retriedFromLogId: log.id,
        },
      },
      include: { actor: { select: { firstName: true, lastName: true } } },
    })

    return withCors(
      ApiResponse.success(mapActivityLog(retryLog), `Retry completed: ${created.count} assignment(s) created`),
      origin
    )
  } catch (e) {
    return withCors(handleApiError(e), origin)
  }
}
