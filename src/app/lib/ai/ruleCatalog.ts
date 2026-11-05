// [ai-assistant] The 12 built-in automation rules, as far as the assistant needs them: which exist, and when each runs by default.
//
// The rule definitions themselves live in the front end (features/intelligence/data.js); the server stores only what an Admin changed
// (automation_rule_settings.overrides). The assistant may propose changes to the two settings that decide WHEN a rule runs and
// WHETHER it runs: cadence and status. Everything that changes WHAT a rule does (conditions, scope, mode, escalation, text) is left to a
// person. tests/ai/rules.test.ts keeps this list in step with automation-engine.ts.
// ar-006, ar-012 and ar-015 were retired with Grade Levels.

// How many custom rules (rule builder) one company may have.
export const MAX_CUSTOM_RULES = 20

export const AI_RULE_FIELDS = ['cadence', 'status'] as const
export type AiRuleField = (typeof AI_RULE_FIELDS)[number]

export const CADENCE_VALUES = ['event', 'hourly', 'daily', 'weekly'] as const
export const CADENCE_LABEL: Record<string, string> = {
  event: 'When a related record changes',
  hourly: 'Every hour',
  daily: 'Every day',
  weekly: 'Every 7 days',
}
export const STATUS_VALUES = ['enabled', 'disabled'] as const
export const STATUS_LABEL: Record<string, string> = { enabled: 'On', disabled: 'Off' }

export const BUILT_IN_RULES: Record<string, { name: string; cadence: string }> = {
  'ar-001': { name: 'Suggest organization assignment for newly registered staff', cadence: 'daily' },
  'ar-002': { name: 'Detect likely duplicate staff records', cadence: 'daily' },
  'ar-003': { name: 'Detect duplicate department structures', cadence: 'daily' },
  'ar-004': { name: 'Detect missing Staff Compensation mappings', cadence: 'daily' },
  'ar-005': { name: 'Check payroll template readiness', cadence: 'daily' },
  'ar-007': { name: 'Prepare impact analysis when a department changes', cadence: 'event' },
  'ar-008': { name: 'Detect payroll template dependency conflicts', cadence: 'daily' },
  'ar-009': { name: 'Detect inactive organizational structures', cadence: 'weekly' },
  'ar-010': { name: 'Detect missing staff data for payroll generation', cadence: 'daily' },
  'ar-011': { name: 'Re-onboarding checks for inactive staff', cadence: 'event' },
  'ar-013': { name: 'Downstream dependency monitoring', cadence: 'event' },
  'ar-014': { name: 'Business unit relationship validation', cadence: 'weekly' },
}

export type RuleOverrides = Record<string, unknown> | null | undefined

// What the rule does now: the saved override if an Admin changed it, otherwise the built-in value.
export function effectiveRuleValue(ruleId: string, field: AiRuleField, overrides: RuleOverrides): string {
  const saved = overrides?.[field]
  if (typeof saved === 'string' && saved) return saved
  return field === 'cadence' ? BUILT_IN_RULES[ruleId]?.cadence ?? 'daily' : 'enabled'
}

export const labelFor = (field: AiRuleField, value: string): string => (field === 'cadence' ? CADENCE_LABEL[value] : STATUS_LABEL[value]) ?? value
