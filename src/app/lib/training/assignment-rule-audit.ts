import { prisma } from '@/app/lib/db'

const RULE_TYPE_LABELS: Record<string, string> = {
  auto_assignment: 'Assignment Workflow',
  trigger_condition: 'Trigger Condition',
  recurring: 'Recurring Assignment',
  expiry_reassignment: 'Expiry Reassignment',
  compliance: 'Compliance Rule',
  notification: 'Notification Rule',
}

type LogAction = 'CREATED' | 'UPDATED' | 'DELETED' | 'ENABLED' | 'DISABLED' | 'RETRY'

interface AssignmentRuleLike {
  id: string
  name: string
  ruleType: string
  scope: string
  trainingProgramId?: string | null
}

export async function logAssignmentRuleActivity(params: {
  companyId: string
  actorId: string
  actorName: string
  action: LogAction
  rule: AssignmentRuleLike
  status?: 'SUCCESS' | 'FAILED'
  durationMs?: number
  affectedEmployees?: { id: string; name: string }[]
  logicLines?: string[]
  debug?: string[]
  extraMetadata?: Record<string, unknown>
}) {
  const {
    companyId, actorId, actorName, action, rule,
    status = 'SUCCESS', durationMs = 0,
    affectedEmployees = [], logicLines = [], debug = [], extraMetadata = {},
  } = params

  const actionLabels: Record<LogAction, string> = {
    CREATED: 'Rule Created',
    UPDATED: 'Rule Updated',
    DELETED: 'Rule Deleted',
    ENABLED: 'Rule Enabled',
    DISABLED: 'Rule Disabled',
    RETRY: 'Execution Retried',
  }

  const target =
    affectedEmployees.length > 0
      ? `${affectedEmployees[0].name}${affectedEmployees.length > 1 ? ` +${affectedEmployees.length - 1}` : ''}`
      : rule.scope

  const metadata = {
    status,
    type: action === 'RETRY' ? 'ASSIGNMENT' : 'SYSTEM',
    ruleName: rule.name,
    triggeredBy: `${actorName} (Manual)`,
    target,
    ruleType: RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType,
    triggerSource: 'Manual',
    durationMs,
    logicLines,
    affectedEmployees: affectedEmployees.map((e) => e.name),
    affectedEmployeeIds: affectedEmployees.map((e) => e.id),
    trainingProgramId: rule.trainingProgramId ?? null,
    actions: [{ label: actionLabels[action], time: new Date().toISOString(), kind: status === 'SUCCESS' ? 'check' : 'error' }],
    timeline: [{ title: actionLabels[action], subtitle: `Performed by ${actorName}` }],
    debug,
    ...extraMetadata,
  }

  return prisma.trainingAuditLog.create({
    data: {
      companyId,
      actorId,
      action,
      entityType: 'assignment_rule',
      entityId: rule.id,
      metadata,
    },
  })
}
