// [ai-assistant] Builds and validates the plan for a custom automation rule the assistant proposes.
//
// The model gives the rule's name, conditions and action. Validation is the same code the rule builder's API uses; the manager (for
// assign_manager) is resolved from a staff number or email to a real active staff member. The proposal creates the rule only after an
// Admin or HR approves it in the Action Center, and the rule is then labelled "Set by AI".
import type { PrismaClient } from '@prisma/client'
import { buildPlan, type ProposalPlan } from './proposals'
import { MAX_CUSTOM_RULES } from './ruleCatalog'
import { CADENCE_TEXT, RECORD_TYPES, describeConditions, findMatches, validateRuleInput, type RuleAction } from '../core-setup/custom-rules'

export interface CustomRuleRequest {
  name: string
  description: string
  conditions: unknown
  action: string
  managerRef?: string
  recordType?: string
  cadence?: string
  // The data categories the company lets the assistant see: a condition on a field in any other category is refused.
  visible: string[]
}

export type CustomRulePlanResult =
  | { ok: false; error: string }
  | { ok: true; plan: ProposalPlan; title: string; matchCount: number }

const ACTION_TEXT: Record<string, string> = {
  notify: 'notify Admins and HR when the match count changes',
  flag: 'raise the matches in the Action Center',
  assign_manager: 'propose a manager for matching staff in the Action Center',
}

export async function buildCustomRulePlan(db: PrismaClient, companyId: string, req: CustomRuleRequest): Promise<CustomRulePlanResult> {
  const action: Record<string, unknown> = { type: String(req.action ?? '') }
  if (action.type === 'assign_manager') {
    const ref = String(req.managerRef ?? '').trim()
    if (!ref) return { ok: false, error: 'assign_manager needs managerRef: the staff number or email of the manager.' }
    const manager = await db.staffRecord.findFirst({
      where: { companyId, isActive: true, OR: [{ staffId: ref }, { email: { equals: ref, mode: 'insensitive' } }] },
      select: { id: true },
    })
    if (!manager) return { ok: false, error: `No active staff member found for manager "${ref}". Use their staff number or email.` }
    action.managerId = manager.id
  }

  const checked = validateRuleInput({ name: req.name, description: req.description, recordType: req.recordType, cadence: req.cadence, conditions: req.conditions, actions: [action] }, { visible: req.visible })
  if (!checked.ok) return { ok: false, error: checked.errors.join(' ') }
  const rule = checked.value

  const existing = await db.customAutomationRule.findMany({ where: { companyId }, select: { name: true } })
  if (existing.length >= MAX_CUSTOM_RULES) return { ok: false, error: `This company already has the maximum of ${MAX_CUSTOM_RULES} custom rules.` }
  if (existing.some((r) => r.name.trim().toLowerCase() === rule.name.toLowerCase())) return { ok: false, error: `A custom rule named "${rule.name}" already exists. Choose a different name.` }

  const { total } = await findMatches(db, companyId, rule.conditions, new Date(), rule.recordType)
  const def = RECORD_TYPES[rule.recordType]
  const kind = (rule.actions[0] as RuleAction).type
  const plan = buildPlan(
    [
      {
        id: 'new-custom-rule',
        label: rule.name,
        from: 'No rule',
        to: `When a ${def.label} matches ${describeConditions(rule.conditions, rule.recordType)}, checked ${CADENCE_TEXT[rule.cadence]}: ${ACTION_TEXT[kind]}. ${total} ${def.plural} match today.`,
        call: { kind: 'customRule', id: 'new', companyId, rule: { name: rule.name, description: rule.description, recordType: rule.recordType, cadence: rule.cadence, conditions: rule.conditions, actions: rule.actions } },
      },
    ],
    [
      { table: 'customRule', id: `name:${rule.name.toLowerCase()}`, field: 'exists', value: 'false', label: `The name "${rule.name}" is still free` },
      { table: 'customRule', id: 'slots', field: 'full', value: 'false', label: 'There is still room for another custom rule' },
    ],
  )
  return { ok: true, plan, title: `Create custom rule "${rule.name}"`, matchCount: total }
}
