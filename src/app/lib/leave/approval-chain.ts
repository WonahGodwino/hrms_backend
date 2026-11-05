// Leave approval routing: department line-manager ladder, then HR.
//
// A request carries a snapshot of its chain as LeaveApprovalStep rows: one
// LINE_MANAGER step per level (closest manager first) and a final HR step.
// Every routing rule lives here so the apply / approve / list routes agree.
//
// LeaveRequest keeps its legacy string fields so existing list filters work:
//   on the ladder  -> status PENDING,           currentStep MANAGER, currentLevel = step level
//   at HR          -> status MANAGER_APPROVED*, currentStep HR,      currentLevel null
//   finished       -> status APPROVED | REJECTED, currentStep COMPLETED
//   (*PENDING when the chain went straight to HR because no manager applies)

import { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/db'
import { sendLeaveNotificationEmail } from '@/app/lib/email'
import { createLeaveNotification, NOTIFICATION_TYPES } from '@/app/lib/notifications/helpers'

type Db = Prisma.TransactionClient | typeof prisma

export const HR_ROLES = ['HR', 'ADMIN', 'SUPER_ADMIN'] as const
export const MAX_LADDER_LEVELS = 5

export type StepKind = 'LINE_MANAGER' | 'HR'
export type StepStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED'
export type PlannedStep = { level: number; kind: StepKind; approverStaffId: string | null }

export const isHrRole = (role?: string | null) => !!role && (HR_ROLES as readonly string[]).includes(role)

// ---------------------------------------------------------------------------
// Ladder + chain planning
// ---------------------------------------------------------------------------

export async function getDepartmentLadder(db: Db, departmentId: string) {
  return db.departmentLineManager.findMany({
    where: { departmentId },
    orderBy: { level: 'asc' },
    select: {
      id: true,
      level: true,
      staffId: true,
      staff: {
        select: { id: true, firstName: true, lastName: true, email: true, position: true, isActive: true },
      },
    },
  })
}

/**
 * Pure: the chain for an applicant. Managers above the applicant's own ladder
 * position (all of them when the applicant is not on the ladder), renumbered
 * from 1, followed by one HR step. An empty manager list goes straight to HR.
 */
export function planChain(
  ladder: Array<{ staffId: string; level: number }>,
  applicantStaffId: string,
): PlannedStep[] {
  const sorted = [...ladder].sort((a, b) => a.level - b.level)
  const own = sorted.find((l) => l.staffId === applicantStaffId)
  const managers = sorted.filter((l) => l.staffId !== applicantStaffId && (!own || l.level > own.level))
  const steps: PlannedStep[] = managers.map((m, i) => ({
    level: i + 1,
    kind: 'LINE_MANAGER',
    approverStaffId: m.staffId,
  }))
  steps.push({ level: managers.length + 1, kind: 'HR', approverStaffId: null })
  return steps
}

/** Legacy request fields that mirror the first pending step of a chain. */
export function requestStateForStep(
  step: { level: number; kind: string; approverStaffId: string | null },
  opts: { managersApproved: boolean },
) {
  if (step.kind === 'LINE_MANAGER') {
    return {
      status: 'PENDING',
      currentStep: 'MANAGER',
      currentLevel: step.level,
      managerApproverId: step.approverStaffId,
    }
  }
  return {
    status: opts.managersApproved ? 'MANAGER_APPROVED' : 'PENDING',
    currentStep: 'HR',
    currentLevel: null as number | null,
  }
}

export async function createSteps(db: Db, leaveRequestId: string, planned: PlannedStep[]) {
  await db.leaveApprovalStep.createMany({
    data: planned.map((s) => ({
      leaveRequestId,
      level: s.level,
      kind: s.kind,
      approverStaffId: s.approverStaffId,
    })),
  })
}

/** Builds + stores the chain for a new request and returns the state to save on it. */
export async function startChain(
  db: Db,
  leaveRequestId: string,
  staff: { id: string; departmentId: string | null },
) {
  const ladder = staff.departmentId ? await getDepartmentLadder(db, staff.departmentId) : []
  const planned = planChain(
    ladder.filter((l) => l.staff?.isActive !== false),
    staff.id,
  )
  await createSteps(db, leaveRequestId, planned)
  return { planned, state: requestStateForStep(planned[0], { managersApproved: false }) }
}

// ---------------------------------------------------------------------------
// Reading the chain
// ---------------------------------------------------------------------------

export async function loadSteps(db: Db, leaveRequestId: string) {
  return db.leaveApprovalStep.findMany({
    where: { leaveRequestId },
    orderBy: { level: 'asc' },
    include: { approver: { select: { id: true, firstName: true, lastName: true, email: true } } },
  })
}

export const currentStepOf = <T extends { status: string }>(steps: T[]) =>
  steps.find((s) => s.status === 'PENDING') || null

/** Timeline shape returned to the UI. */
export function serializeSteps(steps: Awaited<ReturnType<typeof loadSteps>>) {
  return steps.map((s) => ({
    id: s.id,
    level: s.level,
    kind: s.kind,
    status: s.status,
    approverStaffId: s.approverStaffId,
    approverName: s.approver ? `${s.approver.firstName} ${s.approver.lastName}`.trim() : null,
    actedAt: s.actedAt,
    comments: s.comments,
  }))
}

/**
 * Ids of requests currently waiting on this staff member as a line manager
 * (their level is the request's current level, so later levels don't see it yet).
 */
export async function getActionableRequestIds(db: Db, staffId: string): Promise<string[]> {
  const pending = await db.leaveApprovalStep.findMany({
    where: {
      approverStaffId: staffId,
      kind: 'LINE_MANAGER',
      status: 'PENDING',
      leaveRequest: { status: 'PENDING', currentStep: 'MANAGER' },
    },
    select: { leaveRequestId: true, level: true, leaveRequest: { select: { currentLevel: true } } },
  })
  return pending.filter((p) => p.leaveRequest.currentLevel === p.level).map((p) => p.leaveRequestId)
}

/** Departments where this staff member sits on the line-manager ladder. */
export async function getManagedDepartmentIds(db: Db, staffId: string): Promise<string[]> {
  const rows = await db.departmentLineManager.findMany({ where: { staffId }, select: { departmentId: true } })
  return rows.map((r) => r.departmentId)
}

/** The staff member plus every active member of the departments they manage. */
export async function getTeamStaffIds(staffId: string, db: Db = prisma): Promise<string[]> {
  const departmentIds = await getManagedDepartmentIds(db, staffId)
  if (departmentIds.length === 0) return [staffId]
  const team = await db.staffRecord.findMany({
    where: { departmentId: { in: departmentIds }, isActive: true },
    select: { id: true },
  })
  return Array.from(new Set([staffId, ...team.map((t) => t.id)]))
}

// ---------------------------------------------------------------------------
// Who may act
// ---------------------------------------------------------------------------

/** The acting user's staff record (prefers the request's company). */
export async function getActorStaff(user: { email?: string | null }, companyId?: string) {
  if (!user.email) return null
  const where = { email: user.email, isActive: true }
  const inCompany = companyId ? await prisma.staffRecord.findFirst({ where: { ...where, companyId } }) : null
  return inCompany || prisma.staffRecord.findFirst({ where })
}

export async function hasHrCompanyAccess(
  actor: { id: string; role: string; companyId: string | null },
  userId: string | undefined,
  companyId: string,
) {
  if (actor.role === 'SUPER_ADMIN' || actor.companyId === companyId) return true
  if (!userId) return false
  const link = await prisma.userCompany.findFirst({
    where: { userId, companyId, role: { in: ['HR', 'ADMIN', 'ALL'] } },
    select: { id: true },
  })
  return !!link
}

/**
 * Can this actor decide the given pending step?
 * - the step's own line manager, or HR / Admin / Super Admin (override);
 * - HR step: HR roles only;
 * - never your own request (Super Admin excepted so a lone admin isn't locked out).
 */
export function canActOnStep(
  actor: { id: string; role: string } | null,
  request: { staffRecordId: string },
  step: { kind: string; approverStaffId: string | null } | null,
) {
  if (!actor || !step) return false
  if (actor.id === request.staffRecordId && actor.role !== 'SUPER_ADMIN') return false
  if (isHrRole(actor.role)) return true
  return step.kind === 'LINE_MANAGER' && step.approverStaffId === actor.id
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

type DecideArgs = {
  leaveRequestId: string
  expectedKind: StepKind
  action: 'APPROVE' | 'REJECT'
  actor: { id: string; role: string }
  user: { userId?: string; email?: string | null }
  comments?: string | null
}

export class ChainError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** Applies a decision to the current step and advances the request. One transaction. */
export async function decideStep(args: DecideArgs) {
  const { leaveRequestId, expectedKind, action, actor, user, comments } = args
  const by = user.email || user.userId || actor.id

  return prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findUnique({ where: { id: leaveRequestId } })
    if (!request) throw new ChainError('Leave request not found', 404)

    const steps = await tx.leaveApprovalStep.findMany({ where: { leaveRequestId }, orderBy: { level: 'asc' } })
    const step = currentStepOf(steps)
    if (!step || !['PENDING', 'MANAGER_APPROVED'].includes(request.status)) {
      throw new ChainError(`Leave request is already ${request.status.toLowerCase()}`)
    }
    if (step.kind !== expectedKind) {
      throw new ChainError(
        expectedKind === 'HR'
          ? `Leave request is not ready for HR approval. Current status: ${request.status}`
          : 'Leave request is no longer waiting on a line manager',
      )
    }
    if (!canActOnStep(actor, request, step)) {
      throw new ChainError('You are not an approver for this leave request at its current step', 403)
    }

    const now = new Date()
    await tx.leaveApprovalStep.update({
      where: { id: step.id },
      data: {
        status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        actedByStaffId: actor.id,
        actedByUserId: user.userId ?? null,
        actedAt: now,
        comments: comments || null,
      },
    })

    const days = Number(request.totalDays)
    const data: Prisma.LeaveRequestUncheckedUpdateInput = { updatedBy: by }
    let finished: 'APPROVED' | 'REJECTED' | null = null

    if (action === 'REJECT') {
      finished = 'REJECTED'
      await tx.leaveApprovalStep.updateMany({
        where: { leaveRequestId, status: 'PENDING', id: { not: step.id } },
        data: { status: 'SKIPPED' },
      })
      Object.assign(data, {
        status: 'REJECTED',
        currentStep: 'COMPLETED',
        currentLevel: null,
        rejectionReason: comments,
        rejectedByStep: step.kind === 'HR' ? 'HR' : 'MANAGER',
        rejectedById: user.userId ?? actor.id,
        ...(step.kind === 'LINE_MANAGER' ? { managerApproverId: actor.id } : {}),
      })
    } else if (step.kind === 'LINE_MANAGER') {
      const next = steps.find((s) => s.status === 'PENDING' && s.id !== step.id)!
      Object.assign(data, requestStateForStep(next, { managersApproved: true }), {
        managerApprovedAt: now,
        managerApprovedBy: by,
        managerComments: comments || null,
        // The last manager to approve is recorded as "the" manager approver
        // for the legacy fields; a next-level manager overrides this below.
        ...(next.kind === 'LINE_MANAGER' ? {} : { managerApproverId: actor.id }),
      })
    } else {
      finished = 'APPROVED'
      Object.assign(data, {
        status: 'APPROVED',
        currentStep: 'COMPLETED',
        currentLevel: null,
        hrApprovedAt: now,
        hrApprovedBy: by,
        hrApproverUserId: user.userId ?? null,
        hrApproverRole: actor.role,
        hrComments: comments || null,
      })
    }

    const updated = await tx.leaveRequest.update({
      where: { id: leaveRequestId },
      data,
      include: {
        staffRecord: { select: { id: true, firstName: true, lastName: true, email: true, companyId: true } },
        leaveType: { select: { name: true, code: true } },
      },
    })

    if (finished) {
      const balance = await tx.staffLeaveBalance.findFirst({
        where: {
          staffRecordId: request.staffRecordId,
          leaveTypeId: request.leaveTypeId,
          year: new Date().getFullYear(),
        },
      })
      if (balance) {
        await tx.staffLeaveBalance.update({
          where: { id: balance.id },
          data:
            finished === 'APPROVED'
              ? { usedDays: { increment: days }, pendingDays: { decrement: days } }
              : { pendingDays: { decrement: days } },
        })
      }
    }

    return { updated, finished }
  })
}

// ---------------------------------------------------------------------------
// Ladder edits: re-route requests still waiting on the line managers
// ---------------------------------------------------------------------------

export async function resyncPendingRequests(db: Db, departmentId: string) {
  const ladder = (await getDepartmentLadder(db, departmentId)).filter((l) => l.staff?.isActive !== false)

  const open = await db.leaveRequest.findMany({
    where: {
      status: 'PENDING',
      currentStep: 'MANAGER',
      staffRecord: { departmentId },
    },
    select: { id: true, staffRecordId: true },
  })

  for (const req of open) {
    const steps = await db.leaveApprovalStep.findMany({ where: { leaveRequestId: req.id }, orderBy: { level: 'asc' } })
    const acted = steps.filter((s) => s.status === 'APPROVED')
    const alreadyApproved = new Set(acted.map((s) => s.approverStaffId))
    const baseLevel = acted.length ? Math.max(...acted.map((s) => s.level)) : 0

    const managers = planChain(ladder, req.staffRecordId)
      .filter((s) => s.kind === 'LINE_MANAGER' && !alreadyApproved.has(s.approverStaffId))
    const planned: PlannedStep[] = managers.map((m, i) => ({ ...m, level: baseLevel + i + 1 }))
    planned.push({ level: baseLevel + managers.length + 1, kind: 'HR', approverStaffId: null })

    await db.leaveApprovalStep.deleteMany({ where: { leaveRequestId: req.id, status: 'PENDING' } })
    await createSteps(db, req.id, planned)

    await db.leaveRequest.update({
      where: { id: req.id },
      data: requestStateForStep(planned[0], { managersApproved: acted.length > 0 }),
    })
  }
  return open.length
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const asEmailStaff = (s: { id: string; companyId: string; firstName: string; lastName: string; email: string }) => ({
  id: s.id,
  companyId: s.companyId,
  firstName: s.firstName,
  lastName: s.lastName,
  email: s.email,
  staffId: '',
  department: null,
  position: null,
  isRegistered: true,
})

/** Tells whoever must act next (the line manager at the current level, or HR). Never throws. */
export async function notifyNextApprover(leaveRequestId: string) {
  try {
    const request = await prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: {
        staffRecord: { select: { firstName: true, lastName: true, companyId: true } },
        leaveType: { select: { name: true } },
      },
    })
    if (!request || !['PENDING', 'MANAGER_APPROVED'].includes(request.status)) return
    const step = currentStepOf(await prisma.leaveApprovalStep.findMany({ where: { leaveRequestId }, orderBy: { level: 'asc' } }))
    if (!step) return

    const employeeName = `${request.staffRecord.firstName} ${request.staffRecord.lastName}`.trim()
    const emailRequest = {
      id: request.id,
      referenceNumber: request.referenceNumber ?? undefined,
      leaveType: request.leaveType.name,
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: Number(request.totalDays),
      status: request.status,
      currentStep: request.currentStep,
    }

    const recipients =
      step.kind === 'LINE_MANAGER' && step.approverStaffId
        ? await prisma.staffRecord.findMany({
            where: { id: step.approverStaffId, isActive: true },
            select: { id: true, companyId: true, firstName: true, lastName: true, email: true },
          })
        : await prisma.staffRecord.findMany({
            where: { companyId: request.companyId, role: { in: [...HR_ROLES] }, isActive: true },
            select: { id: true, companyId: true, firstName: true, lastName: true, email: true },
          })

    const isHr = step.kind === 'HR'
    for (const r of recipients) {
      await createLeaveNotification(
        r.id,
        isHr ? NOTIFICATION_TYPES.LEAVE_HR_APPROVAL_NEEDED : NOTIFICATION_TYPES.LEAVE_APPROVAL_NEEDED,
        isHr ? 'Leave Awaiting HR Approval' : 'Leave Awaiting Your Approval',
        `${employeeName} requested ${request.leaveType.name} leave (${Number(request.totalDays)} day(s)).`,
        request.id,
        { referenceNumber: request.referenceNumber, level: step.level },
        request.companyId,
      ).catch(() => {})
      await sendLeaveNotificationEmail(asEmailStaff(r), emailRequest, isHr ? 'HR_APPROVAL' : 'MANAGER_APPROVAL', {
        employeeName,
      })
    }
  } catch (e) {
    console.error('Failed to notify next leave approver:', e)
  }
}

/** Tells the applicant the final outcome. Never throws. */
export async function notifyOutcome(updated: {
  id: string
  referenceNumber: string | null
  status: string
  currentStep: string
  startDate: Date
  endDate: Date
  totalDays: Prisma.Decimal | number
  staffRecord: { id: string; firstName: string; lastName: string; email: string; companyId: string | null }
  leaveType: { name: string }
}) {
  try {
    if (!['APPROVED', 'REJECTED'].includes(updated.status) || !updated.staffRecord.companyId) return
    const approved = updated.status === 'APPROVED'
    await sendLeaveNotificationEmail(
      asEmailStaff({ ...updated.staffRecord, companyId: updated.staffRecord.companyId }),
      {
        id: updated.id,
        referenceNumber: updated.referenceNumber ?? undefined,
        leaveType: updated.leaveType.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
        totalDays: Number(updated.totalDays),
        status: updated.status,
        currentStep: updated.currentStep,
      },
      approved ? 'APPROVED' : 'REJECTED',
    )
  } catch (e) {
    console.error('Failed to send leave outcome email:', e)
  }
}
