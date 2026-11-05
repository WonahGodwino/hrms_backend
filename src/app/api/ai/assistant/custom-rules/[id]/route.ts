// [ai-assistant] One custom automation rule — GET, PATCH (edit, or switch on/off) and DELETE.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError, type AiGuardResult } from '@/app/lib/ai/guard'
import { actorFor, recordCoreSetupEvent } from '@/app/lib/core-setup/audit'
import { builderCategories, describeConditions, findMatches, serializeRule, validateRuleInput, type Condition, type RecordTypeKey } from '@/app/lib/core-setup/custom-rules'
import { isRecordType } from '@/app/lib/core-setup/custom-rule-types'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

type Ctx = { params: { id: string } }

type Loaded =
  | { response: Response }
  | { response?: undefined; guard: AiGuardResult; rule: Awaited<ReturnType<typeof prisma.customAutomationRule.findFirst>> }

async function load(request: NextRequest, id: string): Promise<Loaded> {
  const { searchParams } = new URL(request.url)
  const guard = await aiGuard(request, searchParams.get('companyId'), prisma, { requireConnected: false })
  if (isGuardError(guard)) return { response: guard }
  const rule = await prisma.customAutomationRule.findFirst({ where: { id, companyId: guard.companyId } })
  return { guard, rule }
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const origin = request.headers.get('origin')
  try {
    const loaded = await load(request, params.id)
    if (loaded.response) return loaded.response
    if (!loaded.rule) return withCors(ApiResponse.notFound('Custom rule not found'), origin)
    const type: RecordTypeKey = isRecordType(loaded.rule.recordType) ? loaded.rule.recordType : 'staff'
    const { total } = await findMatches(prisma, loaded.guard.companyId, loaded.rule.conditions as unknown as Condition[], new Date(), type)
    return withCors(ApiResponse.success({ rule: serializeRule(loaded.rule, total) }), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const origin = request.headers.get('origin')
  try {
    const loaded = await load(request, params.id)
    if (loaded.response) return loaded.response
    const { guard, rule } = loaded
    if (!rule) return withCors(ApiResponse.notFound('Custom rule not found'), origin)

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    // Only the fields sent change; the result is validated as a whole so a partial edit cannot leave a rule invalid.
    const merged = {
      name: body.name ?? rule.name,
      description: body.description ?? rule.description ?? '',
      recordType: body.recordType ?? rule.recordType,
      cadence: body.cadence ?? rule.cadence,
      conditions: body.conditions ?? rule.conditions,
      actions: body.actions ?? rule.actions,
    }
    // Categories the company hides from the AI Assistant are checked when the conditions or record type change; switching a rule on or off is never blocked.
    const touchesConditions = body.conditions !== undefined || body.recordType !== undefined
    const visible = builderCategories(guard.settings?.visibleCategories)
    const checked = validateRuleInput(merged, touchesConditions ? { visible } : {})
    if (!checked.ok) return withCors(ApiResponse.error(checked.errors[0], 400, checked.errors, { code: 'INVALID_RULE' }), origin)
    const next = checked.value
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : rule.enabled

    const actor = await actorFor(guard.user)
    const contentChanged =
      JSON.stringify([next.name, next.description || '', next.recordType, next.cadence, next.conditions, next.actions]) !==
      JSON.stringify([rule.name, rule.description ?? '', rule.recordType, rule.cadence, rule.conditions, rule.actions])
    const wasEnabled = rule.enabled
    const previousName = rule.name
    const saved = await prisma.$transaction(async (tx) => {
      if (next.name.toLowerCase() !== previousName.trim().toLowerCase()) {
        const clash = await tx.customAutomationRule.findMany({ where: { companyId: guard.companyId, id: { not: rule.id } }, select: { name: true } })
        if (clash.some((r) => r.name.trim().toLowerCase() === next.name.toLowerCase())) return { error: `A custom rule named "${next.name}" already exists.` }
      }
      const row = await tx.customAutomationRule.update({
        where: { id: rule.id },
        data: {
          name: next.name, description: next.description || null, recordType: next.recordType, cadence: next.cadence,
          conditions: next.conditions as unknown as object, actions: next.actions as unknown as object, enabled,
          // A person's own edit of what the rule does clears the "Set by AI" chip, so it never claims a rule the AI no longer describes.
          // Switching it on or off does not. The rule's source and approver stay, so it always shows where it came from.
          ...(contentChanged ? { aiOrigin: false } : {}),
        },
      })
      const toggled = enabled !== wasEnabled
      await recordCoreSetupEvent(tx, {
        companyId: guard.companyId, actor, kind: 'rule', area: 'ai',
        source: 'manual',
        action: toggled ? `Custom automation rule ${enabled ? 'enabled' : 'disabled'}` : 'Custom automation rule edited',
        changeType: toggled ? (enabled ? 'enabled' : 'disabled') : 'updated', object: next.name, status: 'success',
        summary: toggled ? `Custom rule "${next.name}" was switched ${enabled ? 'on' : 'off'}.` : `Custom rule "${next.name}" was edited by hand: ${describeConditions(next.conditions, next.recordType)}.`,
        related: [{ type: 'automation_rule', name: next.name, identifier: `cr-${rule.id}`, status: enabled ? 'Enabled' : 'Disabled', relationship: 'Changed' }],
      })
      return { row }
    })

    if ('error' in saved) return withCors(ApiResponse.error(saved.error, 409, [], { code: 'RULE_NAME_TAKEN' }), origin)
    return withCors(ApiResponse.success({ rule: serializeRule(saved.row) }, 'Rule saved'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const origin = request.headers.get('origin')
  try {
    const loaded = await load(request, params.id)
    if (loaded.response) return loaded.response
    const { guard, rule } = loaded
    if (!rule) return withCors(ApiResponse.notFound('Custom rule not found'), origin)

    const actor = await actorFor(guard.user)
    await prisma.$transaction(async (tx) => {
      await tx.customAutomationRule.delete({ where: { id: rule.id } })
      await recordCoreSetupEvent(tx, {
        companyId: guard.companyId, actor, kind: 'rule', area: 'ai', action: 'Custom automation rule deleted', changeType: 'deleted',
        object: rule.name, status: 'success', summary: `Custom rule "${rule.name}" was deleted.`,
        related: [{ type: 'automation_rule', name: rule.name, identifier: `cr-${rule.id}`, status: 'Deleted', relationship: 'Changed' }],
      })
    })
    return withCors(ApiResponse.success({ deleted: true }, 'Rule deleted'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
