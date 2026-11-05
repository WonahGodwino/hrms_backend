// src/app/lib/staff-loans-benefits/approval-engine.ts
//
// Generic multi-step approval engine shared by LoanRequest, BenefitRequest,
// and BenefitClaim. Routing state lives on the request row itself
// (approvalWorkflow snapshot + currentStepOrder + currentApproverRole +
// currentApproverStaffId) — ApprovalActionLog is a pure append-only audit
// trail, never consulted for routing.
//
// Step resolution (`resolveApprover`) supports three approverKinds:
//   - ROLE:          currentApproverRole = the configured role (e.g. 'HR').
//                     Any staff with that platform role in the company can
//                     act — no specific staffId is stored.
//   - LINE_MANAGER:  resolved once, when the step is entered, from the
//                     requester's StaffRecord.managerId. Not re-resolved if
//                     the org chart changes mid-flight.
//   - DESIGNATION:   currentApproverRole is stored as the synthetic value
//                     `DESIGNATION:<designationId>` (not a single staffId,
//                     since multiple people could hold the same
//                     designation) — any staff currently holding that
//                     designation can act. Requires the company to have the
//                     CORE_SETUP module enabled.
//
// If a step can't be resolved to anyone (no line manager set, nobody holds
// the target designation, or CORE_SETUP is disabled), the request is
// flagged `needsManualAssignment` and a notification goes to the company's
// ADMIN/HR so they can intervene rather than letting the request go stuck
// and invisible.
import { prisma } from '@/app/lib/db'
import { hasModuleAccess } from '@/app/lib/module-access'
import { createNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'
import type { ApprovalStepConfig } from './types'

export type ApprovableRequestType = 'LOAN_REQUEST' | 'BENEFIT_REQUEST' | 'BENEFIT_CLAIM'

export type ResolvedApprover = {
  currentApproverRole: string | null
  currentApproverStaffId: string | null
  needsManualAssignment: boolean
}

export async function resolveApprover(
  step: ApprovalStepConfig,
  ctx: { companyId: string; requestingStaffId: string }
): Promise<ResolvedApprover> {
  if (step.approverKind === 'ROLE') {
    return { currentApproverRole: step.role || null, currentApproverStaffId: null, needsManualAssignment: false }
  }

  if (step.approverKind === 'LINE_MANAGER') {
    const requester = await prisma.staffRecord.findUnique({
      where: { id: ctx.requestingStaffId },
      select: { managerId: true },
    })
    if (!requester?.managerId) {
      return { currentApproverRole: 'LINE_MANAGER', currentApproverStaffId: null, needsManualAssignment: true }
    }
    return { currentApproverRole: 'LINE_MANAGER', currentApproverStaffId: requester.managerId, needsManualAssignment: false }
  }

  if (step.approverKind === 'DEPARTMENT_HEAD') {
    const requester = await prisma.staffRecord.findUnique({
      where: { id: ctx.requestingStaffId },
      select: { departmentId: true },
    })
    if (!requester?.departmentId) {
      return { currentApproverRole: 'DEPARTMENT_HEAD', currentApproverStaffId: null, needsManualAssignment: true }
    }
    const department = await prisma.department.findUnique({
      where: { id: requester.departmentId },
      select: { headId: true },
    })
    if (!department?.headId) {
      return { currentApproverRole: 'DEPARTMENT_HEAD', currentApproverStaffId: null, needsManualAssignment: true }
    }
    return { currentApproverRole: 'DEPARTMENT_HEAD', currentApproverStaffId: department.headId, needsManualAssignment: false }
  }

  // DESIGNATION
  const designationId = step.designationId as string
  const coreSetupEnabled = await hasModuleAccess(ctx.companyId, 'CORE_SETUP')
  if (!coreSetupEnabled) {
    return { currentApproverRole: `DESIGNATION:${designationId}`, currentApproverStaffId: null, needsManualAssignment: true }
  }

  const holders = await prisma.staffRecord.findMany({
    where: { designationId, companyId: ctx.companyId, isActive: true },
    select: { id: true },
    take: 1,
  })
  return {
    currentApproverRole: `DESIGNATION:${designationId}`,
    currentApproverStaffId: null,
    needsManualAssignment: holders.length === 0,
  }
}

// Whether `user` can act on the step a request currently sits at. SUPER_ADMIN
// is always allowed, mirroring the override behavior used everywhere else in
// this app (company/module scoping bypass).
export async function canActOnStep(
  user: { userId: string; role: string },
  request: { currentApproverRole: string | null; currentApproverStaffId: string | null }
): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  if (!request.currentApproverRole) return false

  if (request.currentApproverRole === 'LINE_MANAGER' || request.currentApproverRole === 'DEPARTMENT_HEAD') {
    return request.currentApproverStaffId === user.userId
  }

  if (request.currentApproverRole.startsWith('DESIGNATION:')) {
    const designationId = request.currentApproverRole.slice('DESIGNATION:'.length)
    const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { designationId: true } })
    return staff?.designationId === designationId
  }

  return request.currentApproverRole === user.role
}

// Prisma `OR` clause for "requests I can currently act on" — used by the
// Approvals Dashboard. Company scoping is applied separately by the caller.
export async function buildApproverFilter(user: { userId: string; role: string }) {
  if (user.role === 'SUPER_ADMIN') return {} // sees everything in scope, no OR needed

  const staff = await prisma.staffRecord.findUnique({ where: { id: user.userId }, select: { designationId: true } })

  const or: any[] = [{ currentApproverRole: user.role }, { currentApproverStaffId: user.userId }]
  if (staff?.designationId) {
    or.push({ currentApproverRole: `DESIGNATION:${staff.designationId}` })
  }
  return { OR: or }
}

async function notifyNoEligibleApprover(params: {
  companyId: string
  requestType: ApprovableRequestType
  requestId: string
  stepLabel: string
}) {
  const admins = await prisma.staffRecord.findMany({
    where: { companyId: params.companyId, role: { in: ['ADMIN', 'HR'] }, isActive: true },
    select: { id: true },
  })
  await Promise.all(
    admins.map((a) =>
      createNotification(
        a.id,
        NOTIFICATION_TYPES.APPROVAL_NO_ELIGIBLE_APPROVER,
        'Approval step needs manual assignment',
        `A ${params.requestType.replace('_', ' ').toLowerCase()} is stuck at "${params.stepLabel}" — nobody currently resolves as the approver for this step. Please reassign or intervene.`,
        { requestType: params.requestType, requestId: params.requestId },
        params.companyId
      )
    )
  )
}

// Called once, right after a request enters the approval chain (either
// immediately at submission, or once a required guarantor has accepted).
// Resolves step 1 and returns the fields to write onto the request row.
export async function enterApprovalChain(params: {
  companyId: string
  requestingStaffId: string
  requestType: ApprovableRequestType
  requestId: string
  workflow: ApprovalStepConfig[]
}) {
  const step1 = params.workflow.find((s) => s.order === 1)
  if (!step1) throw new Error('Approval workflow has no step 1')

  const resolved = await resolveApprover(step1, { companyId: params.companyId, requestingStaffId: params.requestingStaffId })

  if (resolved.needsManualAssignment) {
    await notifyNoEligibleApprover({
      companyId: params.companyId,
      requestType: params.requestType,
      requestId: params.requestId,
      stepLabel: describeStep(step1),
    })
  }

  return {
    currentStepOrder: 1,
    currentApproverRole: resolved.currentApproverRole,
    currentApproverStaffId: resolved.currentApproverStaffId,
  }
}

// Resolves the actual staff IDs eligible to act on a given (already-entered)
// step, for notification purposes — a route calls this after writing the
// request so it can send a human-readable "action needed" notification to
// exactly the people who can act right now.
export async function resolveApproverStaffIds(
  request: { currentApproverRole: string | null; currentApproverStaffId: string | null; companyId: string }
): Promise<string[]> {
  if (!request.currentApproverRole) return []

  if (request.currentApproverRole === 'LINE_MANAGER' || request.currentApproverRole === 'DEPARTMENT_HEAD') {
    return request.currentApproverStaffId ? [request.currentApproverStaffId] : []
  }

  if (request.currentApproverRole.startsWith('DESIGNATION:')) {
    const designationId = request.currentApproverRole.slice('DESIGNATION:'.length)
    const holders = await prisma.staffRecord.findMany({
      where: { designationId, companyId: request.companyId, isActive: true },
      select: { id: true },
    })
    return holders.map((h) => h.id)
  }

  // A real platform role (HR/ADMIN/SUPER_ADMIN)
  const staff = await prisma.staffRecord.findMany({
    where: { companyId: request.companyId, role: request.currentApproverRole, isActive: true },
    select: { id: true },
    take: 50,
  })
  return staff.map((s) => s.id)
}

export function describeStep(step: ApprovalStepConfig): string {
  if (step.approverKind === 'ROLE') return step.role || 'Unknown role'
  if (step.approverKind === 'LINE_MANAGER') return 'Line Manager'
  if (step.approverKind === 'DEPARTMENT_HEAD') return "Requester's Department Head"
  return step.designationTitle || `Designation ${step.designationId}`
}

// The outcome of acting on a step — either the request advances to the next
// step, or (on the final step / on rejection) reaches a terminal state.
export type ApprovalDecisionResult =
  | { terminal: false; nextStepOrder: number; currentApproverRole: string | null; currentApproverStaffId: string | null }
  | { terminal: true; outcome: 'APPROVED' | 'REJECTED' }

// Pure decision-advancement logic (no DB writes) — the calling route wraps
// this in a $transaction alongside the model-specific status update and the
// ApprovalActionLog write, since the exact Prisma delegate (loanRequest vs
// benefitRequest vs benefitClaim) differs per caller.
export async function computeNextApprovalState(params: {
  action: 'APPROVED' | 'REJECTED'
  workflow: ApprovalStepConfig[]
  currentStepOrder: number
  companyId: string
  requestingStaffId: string
  requestType: ApprovableRequestType
  requestId: string
}): Promise<ApprovalDecisionResult> {
  if (params.action === 'REJECTED') {
    return { terminal: true, outcome: 'REJECTED' }
  }

  const nextOrder = params.currentStepOrder + 1
  const nextStep = params.workflow.find((s) => s.order === nextOrder)

  if (!nextStep) {
    return { terminal: true, outcome: 'APPROVED' }
  }

  const resolved = await resolveApprover(nextStep, { companyId: params.companyId, requestingStaffId: params.requestingStaffId })
  if (resolved.needsManualAssignment) {
    await notifyNoEligibleApprover({
      companyId: params.companyId,
      requestType: params.requestType,
      requestId: params.requestId,
      stepLabel: describeStep(nextStep),
    })
  }

  return {
    terminal: false,
    nextStepOrder: nextOrder,
    currentApproverRole: resolved.currentApproverRole,
    currentApproverStaffId: resolved.currentApproverStaffId,
  }
}
