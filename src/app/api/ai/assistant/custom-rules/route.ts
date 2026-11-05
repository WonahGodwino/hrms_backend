// [ai-assistant] Custom automation rules — GET (list, with how many staff each matches now) and POST (create).
// Admin, HR and Super Admin, behind the same feature flag and platform switch as the assistant. No AI key is needed.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { aiGuard, isGuardError } from '@/app/lib/ai/guard'
import { assertTrialWritable, trialErrorBody } from '@/app/lib/trial/guard'
import { actorFor, recordCoreSetupEvent } from '@/app/lib/core-setup/audit'
import {
  MAX_RULES_PER_COMPANY, RECORD_TYPES, builderCategories, describeBuildingBlocks, describeConditions, loadRows, selectMatches, serializeRule, validateRuleInput,
  type Condition, type RecordTypeKey, type RuleRow,
} from '@/app/lib/core-setup/custom-rules'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma, { requireConnected: false })
    if (isGuardError(guard)) return guard

    const rules = await prisma.customAutomationRule.findMany({ where: { companyId: guard.companyId }, orderBy: { createdAt: 'asc' } })
    const now = new Date()
    // Each record type is read once, however many rules use it.
    const rows = new Map<string, RuleRow[]>()
    for (const type of new Set(rules.map((r) => r.recordType))) {
      if (type in RECORD_TYPES) rows.set(type, await loadRows(prisma, guard.companyId, type as RecordTypeKey))
    }
    return withCors(
      ApiResponse.success({
        rules: rules.map((r) => serializeRule(r, selectMatches(rows.get(r.recordType) ?? [], r.conditions as unknown as Condition[], now, r.recordType as RecordTypeKey).total)),
        total: rules.length,
        limit: MAX_RULES_PER_COMPANY,
        // The building blocks the builder offers: record types, their fields and operators, schedules.
        blocks: describeBuildingBlocks(),
        visibleCategories: guard.settings ? (guard.settings.visibleCategories as string[]) : [],
      }),
      origin,
    )
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  try {
    const { searchParams } = new URL(request.url)
    const guard = await aiGuard(request, searchParams.get('companyId'), prisma, { requireConnected: false })
    if (isGuardError(guard)) return guard

    // A read-only or expired trial may still read and draft with the assistant, but may not create a rule that would change data.
    try {
      await assertTrialWritable(guard.companyId)
    } catch (err) {
      const body = trialErrorBody(err)
      if (body) return withCors(ApiResponse.error(body.message, body.status, [], { code: body.code }), origin)
      throw err
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    // A condition on a field in a category the company hides from the AI Assistant is refused here as well as for the assistant.
    const visible = builderCategories(guard.settings?.visibleCategories)
    const checked = validateRuleInput(body, { visible })
    if (!checked.ok) return withCors(ApiResponse.error(checked.errors[0], 400, checked.errors, { code: 'INVALID_RULE' }), origin)
    const rule = checked.value

    const actor = await actorFor(guard.user)

    // A rule made by approving an AI proposal carries who asked and who approved. The proposal is checked on the server: it must be an
    // approved custom-rule proposal that this person approved, so the label and names cannot be claimed by an ordinary request.
    let origin_: { requesterId: string; requesterName: string; proposalId: string } | null = null
    if (typeof body.proposalId === 'string' && body.proposalId) {
      const proposal = await prisma.aiProposal.findFirst({ where: { id: body.proposalId, companyId: guard.companyId, type: 'custom_rule', status: 'approved', decidedById: guard.user.userId } })
      if (proposal) {
        const requester = await prisma.staffRecord.findFirst({ where: { id: proposal.createdById, companyId: guard.companyId }, select: { firstName: true, lastName: true, email: true } })
        origin_ = { requesterId: proposal.createdById, requesterName: requester ? `${requester.firstName} ${requester.lastName}`.trim() || requester.email : 'Former staff member', proposalId: proposal.id }
      }
    }
    const fromAi = origin_ !== null || body.aiOrigin === true

    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.customAutomationRule.findMany({ where: { companyId: guard.companyId }, select: { name: true } })
      if (existing.length >= MAX_RULES_PER_COMPANY) return { error: `A company can have at most ${MAX_RULES_PER_COMPANY} custom rules. Delete one first.`, code: 'RULE_LIMIT' as const }
      if (existing.some((r) => r.name.trim().toLowerCase() === rule.name.toLowerCase())) return { error: `A custom rule named "${rule.name}" already exists.`, code: 'RULE_NAME_TAKEN' as const }

      const row = await tx.customAutomationRule.create({
        data: {
          companyId: guard.companyId, name: rule.name, description: rule.description || null,
          recordType: rule.recordType, cadence: rule.cadence,
          enabled: body.enabled !== false,
          conditions: rule.conditions as unknown as object, actions: rule.actions as unknown as object,
          // For an AI rule the requester is the creator and the approving person is recorded as the approver.
          createdById: origin_ ? origin_.requesterId : guard.user.userId, createdByName: origin_ ? origin_.requesterName : actor.name,
          // Labels: aiOrigin drives the "Set by AI" chip (cleared by a hand edit); source and the approver stay, so the rule always shows where it came from.
          aiOrigin: fromAi, source: fromAi ? 'ai_assistant' : 'manual',
          ...(fromAi ? { approvedById: guard.user.userId, approvedByName: actor.name, ...(origin_ ? { proposalId: origin_.proposalId } : {}) } : {}),
        },
      })
      await recordCoreSetupEvent(tx, {
        companyId: guard.companyId, actor, kind: 'rule', area: 'ai', via: request.headers.get('x-change-source') === 'action_center' ? 'action_center' : '',
        action: 'Custom automation rule created', changeType: 'created', object: rule.name, status: 'success',
        summary: `Custom rule "${rule.name}" was created${fromAi ? ' with the AI assistant' : ''}: when a ${RECORD_TYPES[rule.recordType].label} matches ${describeConditions(rule.conditions, rule.recordType)}, checked ${rule.cadence === 'event' ? 'on every scheduler pass' : rule.cadence}.`,
        related: [{ type: 'automation_rule', name: rule.name, identifier: `cr-${row.id}`, status: 'Enabled', relationship: 'Created' }],
      })
      return { row }
    })

    if ('error' in created) return withCors(ApiResponse.error(created.error, 409, [], { code: created.code }), origin)
    return withCors(ApiResponse.success({ rule: serializeRule(created.row) }, 'Rule created', 201), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
