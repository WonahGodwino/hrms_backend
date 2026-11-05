// [ai-assistant] Builds and validates the plan for a built-in automation rule proposal (cadence or on/off).
//
// As with staff changes, the model supplies only references (a rule id, a field, a value). The rule name, the current value and the
// call the Action Center will make are built here from the catalogue and the company's saved settings.
import type { PrismaClient } from '@prisma/client'
import {
  AI_RULE_FIELDS,
  BUILT_IN_RULES,
  CADENCE_LABEL,
  CADENCE_VALUES,
  STATUS_VALUES,
  effectiveRuleValue,
  labelFor,
  type AiRuleField,
} from './ruleCatalog'
import { buildPlan, type ProposalPlan } from './proposals'

export interface RuleChangeRequest {
  ruleId: string
  field: AiRuleField
  value: string
}

export type RulePlanResult = { ok: false; error: string } | { ok: true; plan: ProposalPlan; title: string; ruleName: string }

export async function buildRuleChangePlan(db: PrismaClient, companyId: string, req: RuleChangeRequest): Promise<RulePlanResult> {
  const ruleId = String(req.ruleId ?? '').trim()
  const rule = BUILT_IN_RULES[ruleId]
  if (!rule) return { ok: false, error: `Unknown rule "${ruleId}". Use list_automation_rules for the valid rule ids.` }
  if (!AI_RULE_FIELDS.includes(req.field)) return { ok: false, error: 'field must be cadence or status. Other rule settings can only be changed by a person.' }

  const value = String(req.value ?? '').trim().toLowerCase()
  const allowed: readonly string[] = req.field === 'cadence' ? CADENCE_VALUES : STATUS_VALUES
  if (!allowed.includes(value)) return { ok: false, error: `${req.field} must be one of: ${allowed.join(', ')}.` }

  const saved = await db.automationRuleSetting.findUnique({ where: { companyId_ruleId: { companyId, ruleId } }, select: { overrides: true } })
  const overrides = (saved?.overrides as Record<string, unknown> | null) ?? null
  const current = effectiveRuleValue(ruleId, req.field, overrides)
  if (current === value) return { ok: false, error: `"${rule.name}" already has ${req.field} set to ${labelFor(req.field, value)}. Nothing to propose.` }

  const from = labelFor(req.field, current)
  const to = labelFor(req.field, value)
  const rawSaved = typeof overrides?.[req.field] === 'string' ? (overrides[req.field] as string) : null

  const title = req.field === 'cadence' ? `Run "${rule.name}" ${CADENCE_LABEL[value].toLowerCase()}` : `Switch ${value === 'enabled' ? 'on' : 'off'} "${rule.name}"`
  const plan = buildPlan(
    [
      {
        id: ruleId,
        label: rule.name,
        from,
        to,
        // The company is carried in the call because the browser applies it with the approver's own session (see executePlan).
        call: { kind: 'ruleSetting', id: ruleId, companyId, ruleName: rule.name, overrides: { [req.field]: value, aiOrigin: true }, previous: { [req.field]: current } },
      },
    ],
    [{ table: 'rule', id: ruleId, field: req.field, value: rawSaved, label: `${rule.name}: ${req.field}` }],
  )
  return { ok: true, plan, title, ruleName: rule.name }
}
