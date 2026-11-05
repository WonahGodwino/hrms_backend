// src/app/api/core-setup/automation/runs/route.ts
//
// POST /api/core-setup/automation/runs?companyId=...    body: { runs: [{ ruleId, ruleName?, trigger, detail, evaluated, exceptions, status, error? }] }
//
// Records the checks the scheduler, the record-change triggers and "Run now" ran (PRD 4.4), and raises an alert for the company's
// Admins when a check failed.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { AUTOMATION_DECIDER_ROLES, companyForRequest, raiseFailedCheckAlerts, type FailedCheck } from '@/app/lib/core-setup/automation'
import { actorFor } from '@/app/lib/core-setup/audit'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const TRIGGERS = ['schedule', 'event', 'manual']
const MAX_RUNS_PER_CALL = 100

interface RunInput {
  ruleId?: unknown
  ruleName?: unknown
  trigger?: unknown
  detail?: unknown
  evaluated?: unknown
  exceptions?: unknown
  status?: unknown
  error?: unknown
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const user = requireRole(authHeader.replace('Bearer ', ''), AUTOMATION_DECIDER_ROLES)

    const scope = await companyForRequest(request, user)
    if ('error' in scope) {
      return withCors(ApiResponse.error(scope.error, scope.status), origin)
    }
    const { companyId } = scope

    const body = (await request.json().catch(() => ({}))) as { runs?: RunInput[] }
    const input = (Array.isArray(body.runs) ? body.runs : []).filter((r) => r && typeof r.ruleId === 'string' && r.ruleId).slice(0, MAX_RUNS_PER_CALL)
    if (!input.length) {
      return withCors(ApiResponse.error('runs is required', 400), origin)
    }

    const actor = await actorFor(user)
    const rows = input.map((r) => {
      const trigger = TRIGGERS.includes(String(r.trigger)) ? String(r.trigger) : 'manual'
      return {
        companyId,
        ruleId: String(r.ruleId),
        trigger,
        detail: r.detail ? String(r.detail).slice(0, 2000) : null,
        evaluated: Math.max(0, Math.round(Number(r.evaluated) || 0)),
        exceptions: Math.max(0, Math.round(Number(r.exceptions) || 0)),
        status: r.status === 'failed' ? 'failed' : 'completed',
        error: r.error ? String(r.error).slice(0, 2000) : null,
        // A manual run is a person; scheduled and record-change runs are the automation itself.
        actorId: trigger === 'manual' ? actor.userId ?? null : null,
        actorName: trigger === 'manual' ? actor.name : '247HR Automation',
      }
    })

    const created = await prisma.$transaction(rows.map((data) => prisma.automationRun.create({ data })))

    const failures: FailedCheck[] = created
      .filter((r) => r.status === 'failed')
      .map((r) => ({
        ruleId: r.ruleId,
        name: String(input.find((x) => x.ruleId === r.ruleId)?.ruleName || r.ruleId),
        error: r.error || 'The check could not finish.',
        trigger: r.trigger,
      }))
    // An alert that cannot be written must not lose the record of the run.
    try {
      await raiseFailedCheckAlerts(companyId, failures)
    } catch (err) {
      console.error('[automation] failed to raise the failed-check alert', err)
    }

    return withCors(
      ApiResponse.success(
        created.map((r) => ({
          id: r.id,
          ruleId: r.ruleId,
          trigger: r.trigger,
          detail: r.detail ?? '',
          at: r.createdAt.toISOString(),
          evaluated: r.evaluated,
          exceptions: r.exceptions,
          status: r.status,
          error: r.error ?? '',
          actor: r.actorName ?? '247HR Automation',
        })),
        `${created.length} run${created.length === 1 ? '' : 's'} recorded`,
      ),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
