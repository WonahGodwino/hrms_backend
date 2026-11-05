// [ai-assistant] Propose tools (Phase 2) — propose_staff_change, propose_department_update and propose_undo, plus list_ai_proposals.
// A propose tool never changes company data: it validates the request against real records, saves a pending proposal,
// and tells the model it is waiting in the Action Center. Writes go through lib/ai/proposals, not through prisma here.
import type { ToolDefinition } from './types'
import { createProposal, ProposalError } from '../proposals'
import { buildStaffChangePlan, STAFF_CHANGE_FIELDS, type StaffChangeField } from '../staffPlan'
import { buildDepartmentChangePlan, DEPARTMENT_CHANGE_FIELDS, type DepartmentChangeField } from '../deptPlan'
import { redactSensitive } from '../redact'
import { buildUndoPlan } from '../undoPlan'

const cleanReason = (v: unknown) =>
  redactSensitive(String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, 500)

export const proposeStaffChange: ToolDefinition = {
  name: 'propose_staff_change',
  description:
    'Propose changing the department, designation or reporting manager of one or more staff members. This does NOT change anything: it creates a proposal that an Admin or HR must approve in the Action Center, and the person who asked cannot approve it themselves. Identify staff by staff number or email (from list_staff). Use list_departments first so the department name is exact. At most 25 staff per proposal; one field per proposal.',
  category: 'employment',
  parameters: {
    type: 'object',
    properties: {
      staff: { type: 'array', items: { type: 'string' }, description: 'Staff numbers or emails of the people to change (from list_staff)' },
      field: { type: 'string', description: 'Which field to change', enum: [...STAFF_CHANGE_FIELDS] },
      value: { type: 'string', description: 'New department name, new designation title, or the new manager\'s staff number or email' },
      reason: { type: 'string', description: 'Why this change is proposed. It is shown to the approver.' },
    },
    required: ['staff', 'field', 'value', 'reason'],
  },
  async execute(args, ctx) {
    const staff = Array.isArray(args.staff) ? (args.staff as unknown[]).map((s) => String(s)) : []
    const field = String(args.field ?? '') as StaffChangeField

    const built = await buildStaffChangePlan(ctx.prisma, ctx.companyId, { staff, field, value: String(args.value ?? '') })
    if (!built.ok) return { error: built.error }

    try {
      const { proposal, duplicate } = await createProposal(ctx.prisma, {
        companyId: ctx.companyId,
        conversationId: ctx.conversationId,
        type: 'staff_change',
        title: built.title,
        description: cleanReason(args.reason),
        plan: built.plan,
        createdById: ctx.userId,
      })

      // Names go to the model only when the company lets it see personal data; otherwise it gets staff numbers.
      const showNames = ctx.visibleCategories.includes('personal')
      const hide = '[hidden by company policy]'
      return {
        proposalId: proposal.id,
        status: proposal.status,
        alreadyPending: duplicate,
        changes: built.plan.steps.map((s, i) => ({
          person: showNames ? s.label : built.refs[i],
          from: field === 'manager' && !showNames ? hide : s.from,
          to: field === 'manager' && !showNames ? hide : s.to,
        })),
        skipped: built.skipped,
        next: 'Tell the user this is waiting in the Action Center for approval by an Admin or HR other than themselves, and that nothing has changed yet.',
      }
    } catch (err) {
      if (err instanceof ProposalError) return { error: err.message }
      throw err
    }
  },
}

export const proposeDepartmentUpdate: ToolDefinition = {
  name: 'propose_department_update',
  description:
    'Propose changing the head of one or more departments, or moving departments to a business unit. This does NOT change anything: it creates a proposal that an Admin or HR must approve in the Action Center, and the person who asked cannot approve it themselves. Name departments exactly as list_departments shows them; name the new head by staff number or email (from list_staff). At most 25 departments per proposal; one field per proposal.',
  category: 'employment',
  parameters: {
    type: 'object',
    properties: {
      departments: { type: 'array', items: { type: 'string' }, description: 'Department names (from list_departments)' },
      field: { type: 'string', description: 'Which field to change', enum: [...DEPARTMENT_CHANGE_FIELDS] },
      value: { type: 'string', description: 'The new head\'s staff number or email, or the business unit name' },
      reason: { type: 'string', description: 'Why this change is proposed. It is shown to the approver.' },
    },
    required: ['departments', 'field', 'value', 'reason'],
  },
  async execute(args, ctx) {
    const departments = Array.isArray(args.departments) ? (args.departments as unknown[]).map((s) => String(s)) : []
    const field = String(args.field ?? '') as DepartmentChangeField

    const built = await buildDepartmentChangePlan(ctx.prisma, ctx.companyId, { departments, field, value: String(args.value ?? '') })
    if (!built.ok) return { error: built.error }

    try {
      const { proposal, duplicate } = await createProposal(ctx.prisma, {
        companyId: ctx.companyId,
        conversationId: ctx.conversationId,
        type: 'department_update',
        title: built.title,
        description: cleanReason(args.reason),
        plan: built.plan,
        createdById: ctx.userId,
      })

      // A head is a person: names go to the model only when the company lets it see personal data.
      const showNames = ctx.visibleCategories.includes('personal')
      const hide = '[hidden by company policy]'
      return {
        proposalId: proposal.id,
        status: proposal.status,
        alreadyPending: duplicate,
        changes: built.plan.steps.map((s) => ({
          department: s.label,
          from: field === 'head' && !showNames ? hide : s.from,
          to: field === 'head' && !showNames ? hide : s.to,
        })),
        skipped: built.skipped,
        next: 'Tell the user this is waiting in the Action Center for approval by an Admin or HR other than themselves, and that nothing has changed yet.',
      }
    } catch (err) {
      if (err instanceof ProposalError) return { error: err.message }
      throw err
    }
  },
}

export const listAiProposals: ToolDefinition = {
  name: 'list_ai_proposals',
  description:
    'List the changes the AI Assistant has proposed for this company, newest first: id, kind, status, how many changes, who decided and when. Use it to find the id of an approved proposal before drafting an undo with propose_undo. Titles are shown only when personal data is visible.',
  category: 'employment',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status', enum: ['pending', 'approved', 'partly_applied', 'rejected', 'expired', 'stale', 'all'], default: 'approved' },
      limit: { type: 'number', description: 'How many to return (1-30)', default: 10 },
    },
  },
  async execute(args, ctx) {
    const status = String(args.status ?? 'approved')
    const limit = Math.min(Math.max(Math.floor(Number(args.limit) || 10), 1), 30)
    const rows = await ctx.prisma.aiProposal.findMany({
      where: { companyId: ctx.companyId, ...(status === 'all' ? {} : { status }) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, title: true, status: true, plan: true, decidedAt: true, createdAt: true },
    })
    const showTitles = ctx.visibleCategories.includes('personal')
    return {
      proposals: rows.map((r) => ({
        proposalId: r.id,
        kind: r.type,
        status: r.status,
        changes: ((r.plan as { steps?: unknown[] } | null)?.steps ?? []).length,
        proposedOn: r.createdAt,
        decidedOn: r.decidedAt,
        ...(showTitles ? { title: redactSensitive(r.title) } : {}),
      })),
      returned: rows.length,
    }
  },
}

export const proposeUndo: ToolDefinition = {
  name: 'propose_undo',
  description:
    'Draft the reverse of an approved staff or department change. This does NOT change anything: it creates a new proposal that puts the earlier values back, which an Admin or HR must approve in the Action Center (not the person who asked). Records that were changed again since are left out and listed. Get the proposal id from list_ai_proposals.',
  category: 'employment',
  parameters: {
    type: 'object',
    properties: {
      proposalId: { type: 'string', description: 'Id of the approved proposal to reverse (from list_ai_proposals)' },
      reason: { type: 'string', description: 'Why it is being undone. It is shown to the approver.' },
    },
    required: ['proposalId', 'reason'],
  },
  async execute(args, ctx) {
    const original = await ctx.prisma.aiProposal.findFirst({
      where: { id: String(args.proposalId ?? ''), companyId: ctx.companyId },
      select: { plan: true, type: true, status: true, title: true },
    })
    if (!original) return { error: 'No proposal with that id was found for this company.' }

    const built = await buildUndoPlan(ctx.prisma, ctx.companyId, original)
    if (!built.ok) return { error: built.error }

    try {
      const { proposal, duplicate } = await createProposal(ctx.prisma, {
        companyId: ctx.companyId,
        conversationId: ctx.conversationId,
        type: built.type,
        title: built.title,
        description: cleanReason(args.reason),
        plan: built.plan,
        createdById: ctx.userId,
      })
      const showNames = ctx.visibleCategories.includes('personal')
      return {
        proposalId: proposal.id,
        status: proposal.status,
        alreadyPending: duplicate,
        changes: built.plan.steps.length,
        ...(showNames ? { details: built.plan.steps.map((s) => ({ record: s.label, from: s.from, to: s.to })) } : {}),
        skipped: showNames ? built.skipped : built.skipped.map((s) => ({ reason: s.reason })),
        next: 'Tell the user this undo is waiting in the Action Center for approval by an Admin or HR other than themselves, and that nothing has changed yet.',
      }
    } catch (err) {
      if (err instanceof ProposalError) return { error: err.message }
      throw err
    }
  },
}