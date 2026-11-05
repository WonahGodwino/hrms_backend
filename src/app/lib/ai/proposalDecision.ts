// [ai-assistant] Deciding a proposal (approve / reject / complete).
//
// The backend never applies a plan itself. On approve it checks the proposal is still pending and fresh, claims it atomically,
// and hands the plan back; the approver's browser then runs it through the existing record endpoints (Action Center path, with
// X-Change-Source: action_center) and reports how many changes landed with decision "complete".
import type { PrismaClient } from '@prisma/client'
import type { recordCoreSetupEvent } from '@/app/lib/core-setup/audit'
import { RULE_APPROVER_ROLES, approverRolesFor, otherApproverCount } from './approvers'
import { buildStaffChangePlan, type StaffChangeField } from './staffPlan'
import { buildDepartmentChangePlan, type DepartmentChangeField } from './deptPlan'
import { applyApprovedPlan } from './executePlan'
import {
  checkStale,
  getProposal,
  planWithout,
  recordProposalResult,
  splitStale,
  updateProposalStatus,
  type Db,
  type ProposalPlan,
  type SkippedStep,
  type StaleChange,
} from './proposals'

export type Decision = 'approve' | 'reject' | 'complete'

export { RULE_APPROVER_ROLES }

export interface DecisionInput {
  proposalId: string
  companyId: string
  actor: { userId: string; role: string; name: string }
  decision: Decision
  reason?: string
  result?: { applied: unknown; failed: unknown }
  // Modify (approve only): leave records out, and/or give every remaining record a different value. The plan is rebuilt from real records.
  modifications?: { remove?: unknown; value?: unknown }
}

export interface DecisionDeps {
  audit: typeof recordCoreSetupEvent
}

export type DecisionOutcome =
  | { ok: true; status: ProposalStatusLabel; plan?: ProposalPlan; skipped?: SkippedStep[] }
  | { ok: false; httpStatus: number; code: string; message: string; changes?: StaleChange[] }

type ProposalStatusLabel = 'approved' | 'rejected' | 'completed'

const fail = (httpStatus: number, code: string, message: string, changes?: StaleChange[]): DecisionOutcome => ({ ok: false, httpStatus, code, message, changes })

async function nameOf(db: Db, companyId: string, id: string): Promise<string> {
  const p = await db.staffRecord.findFirst({ where: { id, companyId }, select: { firstName: true, lastName: true, email: true } })
  return p ? `${p.firstName} ${p.lastName}`.trim() || p.email : 'a former staff member'
}

async function notifyRequester(db: Db, companyId: string, userId: string, title: string, message: string, data: Record<string, unknown>) {
  try {
    await db.notification.create({ data: { userId, companyId, type: 'AI_PROPOSAL_DECIDED', title, message, data: data as object } })
  } catch {
    // The requester may have been removed; a missing notification must never undo a decision.
  }
}

export async function decideProposal(db: PrismaClient, input: DecisionInput, deps: DecisionDeps): Promise<DecisionOutcome> {
  const { companyId, actor } = input
  const proposal = await getProposal(db, input.proposalId, companyId)
  if (!proposal) return fail(404, 'PROPOSAL_NOT_FOUND', 'Proposal not found')

  const plan = proposal.plan as unknown as ProposalPlan
  const requester = await nameOf(db, companyId, proposal.createdById)
  const auditBase = {
    companyId,
    actor: { userId: actor.userId, name: actor.name, role: actor.role, type: 'human' as const },
    kind: 'proposal' as const,
    area: 'ai' as const,
    via: 'ai_assistant',
    object: proposal.title,
    related: [{ type: 'ai_proposal', name: proposal.title, identifier: proposal.id, relationship: 'Proposed by the AI Assistant' }],
  }
  const details = [
    { label: 'Requested by', value: requester },
    { label: 'Changes', value: String(plan.steps?.length ?? 0) },
  ]

  if (input.decision === 'complete') {
    if (proposal.status !== 'approved') return fail(409, 'PROPOSAL_NOT_APPROVED', 'Only an approved proposal can be completed.')
    if (proposal.decidedById !== actor.userId) return fail(403, 'NOT_APPROVER', 'Only the person who approved this proposal can report its result.')
    if (typeof (proposal.result as { applied?: unknown } | null)?.applied === 'number') return fail(409, 'ALREADY_COMPLETED', 'The result of this proposal was already recorded.')
    const applied = Number(input.result?.applied)
    const failed = Number(input.result?.failed)
    const total = plan.steps?.length ?? 0
    if (!Number.isInteger(applied) || !Number.isInteger(failed) || applied < 0 || failed < 0 || applied + failed > total) {
      return fail(400, 'INVALID_RESULT', 'applied and failed must be whole numbers that fit the proposal.')
    }
    const skipped = ((proposal.result as { skipped?: SkippedStep[] } | null)?.skipped ?? []).length
    await recordProposalResult(db, proposal.id, companyId, { applied, failed })
    await deps.audit(db, {
      ...auditBase,
      action: `Applied AI proposal: ${proposal.title}`,
      changeType: 'applied',
      status: failed || skipped ? 'partial' : 'success',
      result: failed || skipped ? 'Partly applied' : 'Applied',
      summary: `${applied} of ${total} change${total === 1 ? '' : 's'} applied from the AI proposal "${proposal.title}"${failed ? `. ${failed} could not be changed.` : '.'}${skipped ? ` ${skipped} other record${skipped === 1 ? ' was' : 's were'} skipped because ${skipped === 1 ? 'it' : 'they'} changed since the proposal.` : ''}`,
      details: [
        ...details,
        { label: 'Applied', value: String(applied) },
        { label: 'Not applied', value: String(failed) },
        ...(skipped ? [{ label: 'Skipped (changed since proposed)', value: String(skipped) }] : []),
      ],
    })
    if ((failed || skipped) && proposal.createdById !== actor.userId) {
      await notifyRequester(db, companyId, proposal.createdById, 'Some changes were not applied', `${failed + skipped} of ${total + skipped} changes from "${proposal.title}" were not applied${skipped ? ` (${skipped} changed since it was proposed)` : ''}. Open the Action Center for details.`, { proposalId: proposal.id, applied, failed, skipped })
    }
    return { ok: true, status: 'completed' }
  }

  if (input.decision === 'reject') {
    if (proposal.status !== 'pending' && proposal.status !== 'stale') return fail(409, 'PROPOSAL_NOT_PENDING', `This proposal is already ${proposal.status}.`)
    const reason = (input.reason ?? '').trim()
    const done = await db.$transaction(async (tx) => {
      const claimed = await updateProposalStatus(tx, { id: proposal.id, companyId, from: ['pending', 'stale'], to: 'rejected', decidedById: actor.userId, reason })
      if (!claimed) return false
      await deps.audit(tx, {
        ...auditBase,
        action: `Rejected AI proposal: ${proposal.title}`,
        changeType: 'rejected',
        source: 'approval',
        status: 'rejected',
        reason,
        summary: `${actor.name} rejected the AI proposal "${proposal.title}" requested by ${requester}. Nothing was changed.`,
        details,
      })
      return true
    })
    if (!done) return fail(409, 'PROPOSAL_NOT_PENDING', 'This proposal was just decided by someone else.')
    if (proposal.createdById !== actor.userId) {
      await notifyRequester(db, companyId, proposal.createdById, 'Your AI proposal was rejected', `${actor.name} rejected "${proposal.title}".${reason ? ` Reason: ${reason}` : ''}`, { proposalId: proposal.id, status: 'rejected' })
    }
    return { ok: true, status: 'rejected' }
  }

  // approve
  if (proposal.status !== 'pending') return fail(409, 'PROPOSAL_NOT_PENDING', `This proposal is already ${proposal.status}.`)
  // The requester may not approve their own proposal, unless nobody else could approve it (sole-approver exception).
  const own = proposal.createdById === actor.userId
  if (own && (await otherApproverCount(db, companyId, approverRolesFor(proposal.type), actor.userId)) > 0) {
    return fail(403, 'SELF_APPROVAL', 'You asked the assistant for this change, so someone else must approve it. You can still reject it.')
  }

  if (proposal.type === 'rule_setting' && !RULE_APPROVER_ROLES.includes(actor.role)) {
    return fail(403, 'ROLE_REQUIRED', 'Only an Admin can approve changes to automation rules. You can still reject it.')
  }

  // Modify: the approver leaves records out and/or gives the remaining records another value. The server rebuilds the plan from real
  // records, so what is applied is still checked and built here, never taken from the browser.
  let active = plan
  let modified = false
  const modifyNotes: { label: string; value: string }[] = []
  const mods = input.modifications
  const remove = Array.isArray(mods?.remove) ? [...new Set((mods!.remove as unknown[]).map((x) => String(x)))] : []
  const newValue = typeof mods?.value === 'string' ? mods.value.trim().slice(0, 200) : ''
  if (remove.length || newValue) {
    if (proposal.type !== 'staff_change' && proposal.type !== 'department_update') {
      return fail(400, 'NOT_MODIFIABLE', 'This kind of proposal cannot be changed before approval. Approve it as it is, or reject it.')
    }
    const unknown = remove.filter((id) => !plan.steps.some((s) => s.id === id))
    if (unknown.length) return fail(400, 'UNKNOWN_RECORD', 'One of the records you removed is not part of this proposal.')
    if (remove.length >= plan.steps.length) return fail(400, 'NOTHING_LEFT', 'Every record was removed. Reject the proposal instead.')
    if (remove.length) {
      active = planWithout(plan, remove)
      modifyNotes.push({ label: 'Removed by approver', value: plan.steps.filter((s) => remove.includes(s.id)).map((s) => s.label).slice(0, 10).join(', ') })
    }
    if (newValue && newValue.toLowerCase() !== (plan.meta?.value ?? '').toLowerCase()) {
      if (!plan.meta) return fail(400, 'NOT_MODIFIABLE', 'The value of this proposal cannot be changed. Remove records, or reject it.')
      const refs = Object.values(active.meta?.refs ?? plan.meta.refs)
      const built =
        plan.meta.builder === 'staff'
          ? await buildStaffChangePlan(db as PrismaClient, companyId, { staff: refs, field: plan.meta.field as StaffChangeField, value: newValue })
          : await buildDepartmentChangePlan(db as PrismaClient, companyId, { departments: refs, field: plan.meta.field as DepartmentChangeField, value: newValue })
      if (!built.ok) return fail(400, 'INVALID_MODIFICATION', built.error)
      active = built.plan
      modifyNotes.push({ label: 'Value changed by approver', value: `${plan.meta.value} to ${newValue}` })
    }
    modified = modifyNotes.length > 0
  }

  // Stale check. A change to one record skips just that record; a change to anything shared (the target department, the new manager)
  // makes the whole proposal out of date.
  const changes = await checkStale(db, companyId, active)
  let skipped: SkippedStep[] = []
  if (changes.length) {
    const split = splitStale(active, changes)
    if (split.shared.length || !split.remaining.length) {
      await updateProposalStatus(db, { id: proposal.id, companyId, from: ['pending'], to: 'stale', result: { stale: changes.slice(0, 10) } })
      await deps.audit(db, {
        ...auditBase,
        action: `AI proposal is out of date: ${proposal.title}`,
        changeType: 'stale',
        status: 'stale',
        result: 'Not applied',
        summary: `The AI proposal "${proposal.title}" could not be applied because ${changes.length} record${changes.length === 1 ? ' has' : 's have'} changed since it was proposed.`,
        details: [...details, ...changes.slice(0, 5).map((c) => ({ label: c.label, value: `was ${c.expected}, now ${c.actual}` }))],
      })
      return fail(409, 'PROPOSAL_STALE', 'Some records changed since this was proposed, so it was not applied. Review the current data and ask the assistant again.', changes)
    }
    skipped = split.skipped
    active = planWithout(active, skipped.map((s) => s.stepId))
  }
  const changedPlan = modified || skipped.length > 0

  const reason = (input.reason ?? '').trim()
  const done = await db.$transaction(async (tx) => {
    const claimed = await updateProposalStatus(tx, {
      id: proposal.id,
      companyId,
      from: ['pending'],
      to: 'approved',
      decidedById: actor.userId,
      reason,
      ...(skipped.length ? { result: { skipped } } : {}),
      // What is applied replaces the plan; the plan as first proposed is kept, so the audit trail can show both.
      ...(changedPlan ? { plan: active, originalPlan: plan } : {}),
    })
    if (!claimed) return false
    await deps.audit(tx, {
      ...auditBase,
      action: `Approved AI proposal: ${proposal.title}`,
      changeType: 'approved',
      source: 'approval',
      status: 'approved',
      reason,
      summary:
        (own
          ? `${actor.name} approved their own AI proposal "${proposal.title}" (self-approved: no other Admin or HR could approve it).`
          : `${actor.name} approved the AI proposal "${proposal.title}" requested by ${requester}.`) +
        (modified ? ` The approver modified it first: ${plan.steps.length} proposed, ${active.steps.length + skipped.length} approved.` : '') +
        (skipped.length ? ` ${skipped.length} record${skipped.length === 1 ? ' was' : 's were'} skipped because ${skipped.length === 1 ? 'it' : 'they'} changed since the proposal.` : ''),
      details: [
        ...details,
        ...(own ? [{ label: 'Approval', value: 'Self-approved: the requester was the only person who could approve' }] : []),
        ...modifyNotes,
        ...skipped.slice(0, 10).map((s) => ({ label: `Skipped: ${s.label}`, value: 'changed since proposed' })),
        ...(changedPlan ? [{ label: 'Applied plan', value: `${active.steps.length} change${active.steps.length === 1 ? '' : 's'} (proposed: ${plan.steps.length})` }] : []),
      ],
    })
    return true
  })
  if (!done) return fail(409, 'PROPOSAL_NOT_PENDING', 'This proposal was just decided by someone else.')

  // Apply the approved plan on the server (the source did this in the approver's browser). Steps run one at a time; a failed step
  // leaves its record unchanged and the rest go on. The proposal was just claimed as approved and stale-checked, so the targets are fresh.
  const applyResult = await applyApprovedPlan(
    db,
    { companyId, actor: { userId: actor.userId, role: actor.role, name: actor.name }, plan: active, proposalId: proposal.id, proposalTitle: proposal.title },
    { audit: deps.audit },
  )
  const appliedCount = applyResult.applied.length
  const failedCount = applyResult.failed.length
  const total = active.steps.length

  // Store the outcome; recordProposalResult flips the proposal to partly_applied when some records did not land (or were skipped as stale).
  await recordProposalResult(db, proposal.id, companyId, { applied: appliedCount, failed: failedCount })

  await deps.audit(db, {
    ...auditBase,
    action: `Applied AI proposal: ${proposal.title}`,
    changeType: 'applied',
    status: failedCount || skipped.length ? 'partial' : 'success',
    result: failedCount || skipped.length ? 'Partly applied' : 'Applied',
    summary: `${appliedCount} of ${total} change${total === 1 ? '' : 's'} applied from the AI proposal "${proposal.title}"${failedCount ? `. ${failedCount} could not be changed.` : '.'}${skipped.length ? ` ${skipped.length} other record${skipped.length === 1 ? ' was' : 's were'} skipped because ${skipped.length === 1 ? 'it' : 'they'} changed since the proposal.` : ''}`,
    details: [
      ...details,
      { label: 'Applied', value: String(appliedCount) },
      { label: 'Not applied', value: String(failedCount) },
      ...(skipped.length ? [{ label: 'Skipped (changed since proposed)', value: String(skipped.length) }] : []),
    ],
  }).catch(() => null)

  if (!own) {
    await notifyRequester(db, companyId, proposal.createdById, 'Your AI proposal was approved', `${actor.name} approved "${proposal.title}"${modified ? ' with changes' : ''}.${failedCount || skipped.length ? ` ${failedCount + skipped.length} of ${total + skipped.length} change${total + skipped.length === 1 ? '' : 's'} were not applied.` : ' The changes have been applied.'}`, { proposalId: proposal.id, status: 'approved', applied: appliedCount, failed: failedCount, skipped: skipped.length })
  }
  return { ok: true, status: 'completed', ...(skipped.length ? { skipped } : {}) }
}