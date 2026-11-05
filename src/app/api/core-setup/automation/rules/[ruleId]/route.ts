// src/app/api/core-setup/automation/rules/[ruleId]/route.ts
//
// PATCH /api/core-setup/automation/rules/:ruleId?companyId=...
//
// Enable, disable or edit an automation rule for the company (ADMIN and SUPER_ADMIN only). Only the fields that were sent are
// changed. The change and its audit row are written in one transaction.
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { AUTOMATION_ADMIN_ROLES, cleanRuleOverrides, companyForRequest } from '@/app/lib/core-setup/automation'
import { actorFor, recordCoreSetupEvent } from '@/app/lib/core-setup/audit'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

const text = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

export async function PATCH(request: NextRequest, { params }: { params: { ruleId: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const user = requireRole(authHeader.replace('Bearer ', ''), AUTOMATION_ADMIN_ROLES)

    const scope = await companyForRequest(request, user)
    if ('error' in scope) {
      return withCors(ApiResponse.error(scope.error, scope.status), origin)
    }
    const { companyId } = scope

    const { ruleId: rawId } = params
    const ruleId = decodeURIComponent(rawId)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const patch = cleanRuleOverrides(body)
    if (!Object.keys(patch).length) {
      return withCors(ApiResponse.error('Nothing to change', 400), origin)
    }
    if (patch.status !== undefined && !['enabled', 'disabled'].includes(String(patch.status))) {
      return withCors(ApiResponse.error('status must be "enabled" or "disabled"', 400), origin)
    }

    const actor = await actorFor(user)
    const previous = (body.previous && typeof body.previous === 'object' ? body.previous : {}) as Record<string, unknown>
    const ruleName = text(body.ruleName) || text(patch.name) || ruleId

    const saved = await prisma.$transaction(async (tx) => {
      const existing = await tx.automationRuleSetting.findUnique({ where: { companyId_ruleId: { companyId, ruleId } } })
      const before = (existing?.overrides as Record<string, unknown> | null) ?? {}
      const next = { ...before, ...patch }

      const row = await tx.automationRuleSetting.upsert({
        where: { companyId_ruleId: { companyId, ruleId } },
        update: { overrides: next as Prisma.InputJsonValue, updatedById: actor.userId ?? null, updatedByName: actor.name },
        create: { companyId, ruleId, overrides: next as Prisma.InputJsonValue, updatedById: actor.userId ?? null, updatedByName: actor.name },
      })

      // What actually changed, compared with the saved override or, for a first change, with what the screen showed.
      const changes = Object.entries(patch)
        .filter(([k, v]) => JSON.stringify(before[k] ?? previous[k]) !== JSON.stringify(v))
        .map(([k, v]) => ({ field: k, from: text(before[k] ?? previous[k]), to: text(v) }))
      const turned = patch.status !== undefined && patch.status !== (before.status ?? previous.status)
      const enabled = patch.status === 'enabled'

      await recordCoreSetupEvent(tx, {
        companyId,
        actor,
        kind: 'rule',
        action: turned ? (enabled ? 'Automation enabled' : 'Automation disabled') : 'Automation rule edited',
        object: ruleName,
        changeType: turned ? (enabled ? 'enabled' : 'disabled') : 'updated',
        status: 'success',
        summary: turned
          ? `${ruleName} was ${enabled ? 'switched on' : 'switched off'}.`
          : `${ruleName} was edited (${changes.map((c) => c.field).join(', ') || 'no field changes'}).`,
        fieldChanges: changes.map((c) => ({ field: c.field, previousValue: c.from, newValue: c.to, changeType: 'changed' })),
        related: [{ type: 'automation_rule', name: ruleName, identifier: ruleId, status: String(next.status ?? 'enabled'), relationship: 'Changed' }],
      })
      return row
    })

    return withCors(
      ApiResponse.success(
        { ...((saved.overrides as Record<string, unknown>) ?? {}), updatedAt: saved.updatedAt.toISOString(), updatedBy: saved.updatedByName ?? '' },
        'Rule saved',
      ),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
