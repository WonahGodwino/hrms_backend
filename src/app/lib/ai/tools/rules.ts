// [ai-assistant] Automation rule tools (Phase 2) — list_automation_rules (read) and propose_rule_change (proposes only).
// propose_rule_change never edits a rule: it saves a pending proposal that an Admin approves in the Action Center.
import type { ToolDefinition } from './types'
import { createProposal, ProposalError } from '../proposals'
import { buildRuleChangePlan } from '../rulePlan'
import { buildCustomRulePlan } from '../customRulePlan'
import { AI_RULE_FIELDS, BUILT_IN_RULES, CADENCE_VALUES, STATUS_VALUES, effectiveRuleValue, labelFor, type AiRuleField } from '../ruleCatalog'
import { redactSensitive } from '../redact'
import { CADENCES, RECORD_TYPES, RECORD_TYPE_KEYS } from '../../core-setup/custom-rule-types'

const cleanReason = (v: unknown) =>
  redactSensitive(String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, 500)

export const listAutomationRules: ToolDefinition = {
  name: 'list_automation_rules',
  description:
    'List the 12 built-in automation rules with their rule id, whether each is on, how often it runs, and whether the AI Assistant set it. Use this to find the rule id before proposing a change.',
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx) {
    const rows = await ctx.prisma.automationRuleSetting.findMany({
      where: { companyId: ctx.companyId },
      select: { ruleId: true, overrides: true },
    })
    const saved = new Map(rows.map((r) => [r.ruleId, (r.overrides as Record<string, unknown> | null) ?? {}]))
    const rules = Object.entries(BUILT_IN_RULES).map(([ruleId, rule]) => {
      const overrides = saved.get(ruleId) ?? null
      return {
        ruleId,
        name: rule.name,
        status: labelFor('status', effectiveRuleValue(ruleId, 'status', overrides)),
        runs: labelFor('cadence', effectiveRuleValue(ruleId, 'cadence', overrides)),
        setByAssistant: overrides?.aiOrigin === true,
      }
    })
    return { rules, total: rules.length }
  },
}

// What a custom rule can be made from, spelled out for the model from the same registry the rule builder and the evaluator use.
const BLOCKS = RECORD_TYPE_KEYS.map((key) => {
  const t = RECORD_TYPES[key]
  const fields = Object.entries(t.fields).map(([f, d]) => `${f} (${d.operators.join('/')}${d.values ? `; ${d.values.join('/')}` : ''}${d.category ? `; needs ${d.category} data` : ''})`)
  return `${key}: ${fields.join(', ')}`
}).join('. ')

export const proposeCustomRule: ToolDefinition = {
  name: 'propose_custom_rule',
  description:
    `Propose a NEW custom automation rule: on a schedule, check one kind of record against 1 to 5 conditions (all must match) and do one action. This does NOT create anything: it saves a proposal that an Admin or HR must approve in the Action Center, and the person who asked cannot approve it themselves. Record types and their condition fields: ${BLOCKS}. Operators: equals, not_equals, is_empty, is_not_empty, greater_than, less_than, older_than (a number of days), count_above (a count). Value: text, or a whole number; leave it empty for is_empty and is_not_empty. Schedules (cadence): event (every check), hourly, daily, weekly. Actions: notify (tell Admins and HR when the match count changes), flag (raise the matches in the Action Center), assign_manager (staff only: propose a manager for matching staff). A rule never changes a record itself. A field that needs a data category the company hides from you is refused.`,
  category: 'employment',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short rule name, unique in the company' },
      description: { type: 'string', description: 'What the rule is for. Shown to the approver.' },
      recordType: { type: 'string', description: 'What the rule checks (default staff)', enum: [...RECORD_TYPE_KEYS] },
      cadence: { type: 'string', description: 'How often it is checked (default daily)', enum: [...CADENCES] },
      conditions: {
        type: 'array',
        description: 'One to five conditions; a record must match all of them',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'A field of the chosen record type' },
            operator: { type: 'string', enum: ['equals', 'not_equals', 'is_empty', 'is_not_empty', 'greater_than', 'less_than', 'older_than', 'count_above'] },
            value: { type: 'string', description: 'Text, or a number (days for older_than and tenure); empty for is_empty / is_not_empty' },
          },
          required: ['field', 'operator'],
        },
      },
      action: { type: 'string', description: 'What the rule does for matching records', enum: ['notify', 'flag', 'assign_manager'] },
      managerRef: { type: 'string', description: 'Only for assign_manager: the manager\'s staff number or email' },
    },
    required: ['name', 'conditions', 'action'],
  },  async execute(args, ctx) {
    const conditions = Array.isArray(args.conditions) ? (args.conditions as Record<string, unknown>[]) : []
    const built = await buildCustomRulePlan(ctx.prisma, ctx.companyId, {
      name: String(args.name ?? ''),
      description: cleanReason(args.description),
      conditions,
      action: String(args.action ?? ''),
      managerRef: args.managerRef === undefined ? undefined : String(args.managerRef),
      recordType: args.recordType === undefined ? undefined : String(args.recordType),
      cadence: args.cadence === undefined ? undefined : String(args.cadence),
      visible: ctx.visibleCategories,
    })
    if (!built.ok) return { error: built.error }

    try {
      const { proposal, duplicate } = await createProposal(ctx.prisma, {
        companyId: ctx.companyId,
        conversationId: ctx.conversationId,
        type: 'custom_rule',
        title: built.title,
        description: cleanReason(args.description),
        plan: built.plan,
        createdById: ctx.userId,
      })
      return {
        proposalId: proposal.id,
        status: proposal.status,
        alreadyPending: duplicate,
        staffMatchingToday: built.matchCount,
        next: 'Tell the user this is waiting in the Action Center for approval by an Admin or HR other than themselves, and that no rule exists yet.',
      }
    } catch (err) {
      if (err instanceof ProposalError) return { error: err.message }
      throw err
    }
  },
}

export const proposeRuleChange: ToolDefinition = {
  name: 'propose_rule_change',
  description:
    'Propose changing when a built-in automation rule runs (cadence) or switching it on or off (status). This does NOT change anything: it creates a proposal that an Admin must approve in the Action Center. Use list_automation_rules first for the rule id. Only cadence and status can be proposed; other rule settings are changed by a person.',
  parameters: {
    type: 'object',
    properties: {
      ruleId: { type: 'string', description: 'The rule id from list_automation_rules, for example ar-005', enum: Object.keys(BUILT_IN_RULES) },
      field: { type: 'string', description: 'cadence = how often it runs, status = on or off', enum: [...AI_RULE_FIELDS] },
      value: { type: 'string', description: `For cadence: ${CADENCE_VALUES.join(', ')} (event = only when a related record changes). For status: ${STATUS_VALUES.join(', ')}.` },
      reason: { type: 'string', description: 'Why this change is proposed. It is shown to the approver.' },
    },
    required: ['ruleId', 'field', 'value', 'reason'],
  },
  async execute(args, ctx) {
    const built = await buildRuleChangePlan(ctx.prisma, ctx.companyId, {
      ruleId: String(args.ruleId ?? ''),
      field: String(args.field ?? '') as AiRuleField,
      value: String(args.value ?? ''),
    })
    if (!built.ok) return { error: built.error }

    try {
      const { proposal, duplicate } = await createProposal(ctx.prisma, {
        companyId: ctx.companyId,
        conversationId: ctx.conversationId,
        type: 'rule_setting',
        title: built.title,
        description: cleanReason(args.reason),
        plan: built.plan,
        createdById: ctx.userId,
      })
      const step = built.plan.steps[0]
      return {
        proposalId: proposal.id,
        status: proposal.status,
        alreadyPending: duplicate,
        change: { rule: built.ruleName, from: step.from, to: step.to },
        next: 'Tell the user this is waiting in the Action Center for approval by an Admin other than themselves, and that nothing has changed yet.',
      }
    } catch (err) {
      if (err instanceof ProposalError) return { error: err.message }
      throw err
    }
  },
}
