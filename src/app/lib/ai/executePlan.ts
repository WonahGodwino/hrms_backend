// [ai-assistant] Applies an approved proposal's plan on the server.
//
// The source applied plans in the approver's browser (calling the record endpoints). Here the server applies them, so what runs is
// exactly the plan the server built and re-checked for staleness, never anything the browser could alter. Each step reuses the same
// record-mutation helpers the screens use (department/designation sync, the automation-rule upsert, the custom-rule create), so
// permissions were already enforced by the guard and the data stays consistent with a manual edit.
//
// Semantics match the source: steps are applied one at a time; a step that fails leaves that record unchanged and the rest go on
// (so the result can be "partly applied"). The proposal was claimed as approved in a transaction and stale-checked first, so by the
// time we get here the target values are known to be valid and fresh.
import type { PrismaClient, Prisma } from '@prisma/client'
import { reconcileStaffDepartmentLink } from '@/app/lib/departments/department-sync'
import { reconcileStaffDesignationLink } from '@/app/lib/designations/designation-sync'
import { cleanRuleOverrides } from '@/app/lib/core-setup/automation'
import type { recordCoreSetupEvent } from '@/app/lib/core-setup/audit'
import type { PlanStep, ProposalPlan } from './proposals'

export interface ApplyActor {
  userId: string
  role: string
  name: string
}

export interface ApplyInput {
  companyId: string
  actor: ApplyActor
  plan: ProposalPlan
  proposalId: string
  proposalTitle: string
}

export interface ApplyDeps {
  audit: typeof recordCoreSetupEvent
}

export interface ApplyResult {
  applied: { label: string; from: string; to: string }[]
  failed: { label: string; reason: string }[]
  total: number
}

type Area = 'staff' | 'org'

// A record change that has already been saved is logged, never blocking the apply. The trail points back at the proposal it came from.
async function auditStep(
  db: PrismaClient,
  deps: ApplyDeps,
  input: ApplyInput,
  step: PlanStep,
  area: Area,
  action: string,
  field: string,
) {
  try {
    await deps.audit(db, {
      companyId: input.companyId,
      actor: { userId: input.actor.userId, name: input.actor.name, role: input.actor.role, type: 'human' },
      kind: 'record',
      area,
      via: 'action_center',
      action,
      object: step.label,
      changeType: 'updated',
      source: 'approval',
      status: 'success',
      summary: `${step.label}: ${field} changed from ${step.from || 'not set'} to ${step.to} (applied from the AI proposal "${input.proposalTitle}").`,
      fieldChanges: [{ field, previousValue: step.from, newValue: step.to, changeType: 'changed' }],
      related: [{ type: 'ai_proposal', name: input.proposalTitle, identifier: input.proposalId, relationship: 'Applied from the AI Assistant' }],
    })
  } catch {
    /* the change is already saved; a missing audit row must never undo it */
  }
}

async function applyStep(db: PrismaClient, deps: ApplyDeps, input: ApplyInput, step: PlanStep): Promise<void> {
  const call = step.call
  const { companyId } = input

  switch (call.kind) {
    case 'staffDept': {
      const staff = await db.staffRecord.findFirst({ where: { id: call.id, companyId }, select: { id: true, department: true, departmentId: true, position: true } })
      if (!staff) throw new Error('staff record not found for this company')
      const name = String(call.department ?? '')
      await db.staffRecord.update({ where: { id: staff.id }, data: { department: name } })
      // Relinks departmentId, keeps headcounts right and writes its own department-history row.
      await reconcileStaffDepartmentLink(staff.id, companyId, name, staff.departmentId, staff.position, input.actor.userId, input.actor.name)
      await auditStep(db, deps, input, step, 'staff', 'Staff department changed', 'department')
      return
    }
    case 'staffDesig': {
      const staff = await db.staffRecord.findFirst({ where: { id: call.id, companyId }, select: { id: true, designationId: true } })
      if (!staff) throw new Error('staff record not found for this company')
      const designationId = String(call.designationId ?? '')
      // Verifies the designation belongs to this company and sets designationId; throws if it does not.
      await reconcileStaffDesignationLink({ staffId: staff.id, companyId, rawPosition: null, currentDesignationId: staff.designationId, explicitDesignationId: designationId })
      // The free-text position is kept in step with the linked designation title the approver saw.
      await db.staffRecord.update({ where: { id: staff.id }, data: { position: step.to } })
      await auditStep(db, deps, input, step, 'staff', 'Staff designation changed', 'designation')
      return
    }
    case 'staffManager': {
      const staff = await db.staffRecord.findFirst({ where: { id: call.id, companyId }, select: { id: true } })
      if (!staff) throw new Error('staff record not found for this company')
      await db.staffRecord.update({ where: { id: staff.id }, data: { managerId: String(call.managerId ?? '') } })
      await auditStep(db, deps, input, step, 'staff', 'Staff reporting manager changed', 'manager')
      return
    }
    case 'deptHead': {
      const dept = await db.department.findFirst({ where: { id: call.id, companyId }, select: { id: true } })
      if (!dept) throw new Error('department not found for this company')
      await db.department.update({ where: { id: dept.id }, data: { headId: String(call.headId ?? '') } })
      await auditStep(db, deps, input, step, 'org', 'Department head changed', 'head')
      return
    }
    case 'deptBU': {
      const dept = await db.department.findFirst({ where: { id: call.id, companyId }, select: { id: true } })
      if (!dept) throw new Error('department not found for this company')
      // Sets both the canonical link and the denormalised name the screens display.
      await db.department.update({ where: { id: dept.id }, data: { businessUnit: String(call.businessUnit ?? ''), businessUnitId: call.businessUnitId ? String(call.businessUnitId) : null } })
      await auditStep(db, deps, input, step, 'org', 'Department business unit changed', 'business unit')
      return
    }
    case 'ruleSetting': {
      const ruleId = String(call.id)
      const patch = cleanRuleOverrides((call.overrides as Record<string, unknown>) ?? {})
      const existing = await db.automationRuleSetting.findUnique({ where: { companyId_ruleId: { companyId, ruleId } } })
      const before = (existing?.overrides as Record<string, unknown> | null) ?? {}
      const next = { ...before, ...patch }
      await db.automationRuleSetting.upsert({
        where: { companyId_ruleId: { companyId, ruleId } },
        update: { overrides: next as Prisma.InputJsonValue, updatedById: input.actor.userId, updatedByName: input.actor.name },
        create: { companyId, ruleId, overrides: next as Prisma.InputJsonValue, updatedById: input.actor.userId, updatedByName: input.actor.name },
      })
      await auditStep(db, deps, input, step, 'org', 'Automation rule changed', String(call.ruleName ?? 'rule'))
      return
    }
    case 'customRule': {
      const rule = (call.rule ?? {}) as Record<string, unknown>
      const name = String(rule.name ?? '').trim()
      if (!name) throw new Error('the custom rule has no name')
      // A name already in use is treated as a failed step rather than throwing the whole apply.
      const clash = await db.customAutomationRule.findFirst({ where: { companyId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })
      if (clash) throw new Error(`a custom rule named "${name}" already exists`)
      await db.customAutomationRule.create({
        data: {
          companyId,
          name,
          description: rule.description ? String(rule.description) : null,
          recordType: String(rule.recordType ?? 'staff'),
          cadence: String(rule.cadence ?? 'daily'),
          conditions: (rule.conditions ?? []) as Prisma.InputJsonValue,
          actions: (rule.actions ?? []) as Prisma.InputJsonValue,
          enabled: true,
          aiOrigin: true,
          source: 'ai_assistant',
          createdById: input.actor.userId,
          createdByName: input.actor.name,
          approvedById: input.actor.userId,
          approvedByName: input.actor.name,
          proposalId: input.proposalId,
        },
      })
      await auditStep(db, deps, input, step, 'org', 'Custom automation rule created', 'custom rule')
      return
    }
    default:
      throw new Error(`unknown plan call: ${String((call as { kind?: unknown }).kind)}`)
  }
}

// Applies every step of an approved plan. Never throws: a step that fails is reported in `failed` and the rest continue.
export async function applyApprovedPlan(db: PrismaClient, input: ApplyInput, deps: ApplyDeps): Promise<ApplyResult> {
  const applied: ApplyResult['applied'] = []
  const failed: ApplyResult['failed'] = []
  for (const step of input.plan.steps) {
    try {
      await applyStep(db, deps, input, step)
      applied.push({ label: step.label, from: step.from, to: step.to })
    } catch (err) {
      failed.push({ label: step.label, reason: err instanceof Error ? err.message : 'could not be applied' })
    }
  }
  return { applied, failed, total: input.plan.steps.length }
}
