import type {
  AppraisalCycleStatus,
  AppraisalEscalationCategory,
  PolicyExceptionStatus,
  Prisma,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import {
  HR_REVIEWER_ROLES,
  UNASSIGNED_KEY,
  effectiveDeadline,
  fullName,
  parseEntityId,
} from "@/app/lib/performance-operations/ops-utils";
import type { CycleForOps } from "@/app/lib/performance-operations/ops-utils";
import { AppraisalReminderRecipient } from "@prisma/client";

// Who can be (re)assigned as the reviewer of a manager review: line managers
// plus HR/Admin. Used by GET /reviewer-candidates AND by REASSIGN_REVIEWER, so
// the dropdown and the server-side validation can never disagree.
export const REVIEWER_ELIGIBLE_ROLES: string[] = ["MANAGER", ...HR_REVIEWER_ROLES];

// Cycles whose deadlines / reviewers can still be changed.
export const MUTABLE_CYCLE_STATUSES: AppraisalCycleStatus[] = [
  "ACTIVE",
  "ESCALATED",
  "PAUSED",
];

export const VALID_POLICY_DECISIONS: PolicyExceptionStatus[] = [
  "APPROVED",
  "DENIED",
];

export const MAX_BULK_ENTITIES = 200;
export const MAX_POLICY_PARTICIPANTS = 500;
export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_NOTE_LENGTH = 2000;

export function chunk<T>(arr: T[], size = 5000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const formatDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Accepts "YYYY-MM-DD" (normalised to the END of that day, UTC, so an item due
 * "on the 15th" is not overdue at 00:00 on the 15th) or a full ISO datetime.
 * Returns null when invalid.
 */
export function parseDueDate(input: unknown): Date | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const s = input.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(dateOnly ? `${s}T23:59:59.999Z` : s);
  if (Number.isNaN(d.getTime())) return null;
  if (dateOnly && d.toISOString().slice(0, 10) !== s) return null; // e.g. 2026-02-31
  return d;
}

export async function getActorName(actorId: string): Promise<string> {
  const rec = await prisma.staffRecord.findUnique({
    where: { id: actorId },
    select: { firstName: true, lastName: true },
  });
  return fullName(rec) ?? "an administrator";
}

// ---------------------------------------------------------------------------
// Entity selection (bulk operations)
// ---------------------------------------------------------------------------
export interface EntitySelectionOk {
  departmentIds: string[];
  includesUnassigned: boolean;
  departmentKeys: string[]; // department ids and/or UNASSIGNED_KEY
  departmentNames: Map<string, string>; // key -> display name
  participantWhere: Prisma.AppraisalCycleParticipantWhereInput;
}

export async function resolveEntitySelection(
  companyId: string,
  cycleId: string,
  entityIds: unknown,
): Promise<EntitySelectionOk | { error: string; status: number }> {
  if (!Array.isArray(entityIds) || entityIds.length === 0)
    return { error: "entityIds must be a non-empty array", status: 400 };
  if (entityIds.length > MAX_BULK_ENTITIES)
    return {
      error: `entityIds must contain at most ${MAX_BULK_ENTITIES} items`,
      status: 400,
    };

  const keys = new Set<string>();
  for (const raw of entityIds) {
    const parsed = typeof raw === "string" ? parseEntityId(raw) : null;
    if (!parsed)
      return { error: "One or more entityIds are invalid", status: 400 };
    if (parsed.cycleId !== cycleId)
      return {
        error: "All entityIds must belong to the selected cycle",
        status: 400,
      };
    keys.add(parsed.departmentId ?? UNASSIGNED_KEY);
  }

  const departmentKeys = Array.from(keys);
  const departmentIds = departmentKeys.filter((k) => k !== UNASSIGNED_KEY);
  const includesUnassigned = keys.has(UNASSIGNED_KEY);

  // Cross-company check: every department must belong to this company.
  const departments = departmentIds.length
    ? await prisma.department.findMany({
        where: { id: { in: departmentIds }, companyId },
        select: { id: true, name: true },
      })
    : [];
  if (departments.length !== departmentIds.length)
    return {
      error: "One or more departments were not found in this company",
      status: 404,
    };

  const departmentNames = new Map<string, string>(
    departments.map((d) => [d.id, d.name] as const),
  );
  if (includesUnassigned) departmentNames.set(UNASSIGNED_KEY, "Unassigned");

  const or: Prisma.AppraisalCycleParticipantWhereInput[] = [];
  if (departmentIds.length) or.push({ departmentId: { in: departmentIds } });
  if (includesUnassigned) or.push({ departmentId: null });

  return {
    departmentIds,
    includesUnassigned,
    departmentKeys,
    departmentNames,
    participantWhere: { cycleId, companyId, OR: or },
  };
}

// ---------------------------------------------------------------------------
// SYSTEM notes (immutable compliance trail shown in the Drawer feed)
// ---------------------------------------------------------------------------
export async function writeSystemNotes(
  tx: Prisma.TransactionClient,
  p: {
    companyId: string;
    cycleId: string;
    notes: { departmentKey: string; message: string }[];
  },
) {
  if (p.notes.length === 0) return;
  await tx.performanceOpsNote.createMany({
    data: p.notes.map((n) => ({
      companyId: p.companyId,
      cycleId: p.cycleId,
      departmentId: n.departmentKey === UNASSIGNED_KEY ? null : n.departmentKey,
      type: "SYSTEM" as const,
      authorId: null,
      message: n.message.slice(0, MAX_NOTE_LENGTH),
    })),
  });
}

// ---------------------------------------------------------------------------
// Deadline extension (shared by EXTEND_DUE_DATE and policy-exception approval)
// Sets deadlineOverride on OPEN phases only, and never SHORTENS a deadline:
// phases whose effective deadline is already on/after the new date are skipped.
// ---------------------------------------------------------------------------
export interface ExtendResult {
  participantsAffected: number;
  phasesExtended: number;
  phasesSkipped: number;
  perDepartment: Map<string, { participants: number; phases: number }>;
}

export async function extendOpenPhases(
  tx: Prisma.TransactionClient,
  p: {
    cycleId: string;
    participantWhere: Prisma.AppraisalCycleParticipantWhereInput;
    newDueDate: Date;
  },
): Promise<ExtendResult> {
  const cyclePhases = await tx.appraisalCyclePhase.findMany({
    where: { cycleId: p.cycleId },
    select: { phaseType: true, deadline: true },
  });
  const openPhases = await tx.appraisalParticipantPhase.findMany({
    where: {
      cycleId: p.cycleId,
      status: { not: "COMPLETED" },
      participant: p.participantWhere,
    },
    select: {
      id: true,
      participantId: true,
      phaseType: true,
      deadlineOverride: true,
      participant: { select: { departmentId: true } },
    },
  });

  const deadlineByType = new Map(
    cyclePhases.map((c) => [c.phaseType, c.deadline] as const),
  );
  const toUpdate: string[] = [];
  const affected = new Set<string>();
  const perDept = new Map<
    string,
    { participantIds: Set<string>; phases: number }
  >();
  let skipped = 0;

  for (const ph of openPhases) {
    const current = effectiveDeadline(
      ph.deadlineOverride,
      deadlineByType.get(ph.phaseType),
    );
    if (current && current >= p.newDueDate) {
      skipped += 1;
      continue;
    }
    toUpdate.push(ph.id);
    affected.add(ph.participantId);
    const key = ph.participant.departmentId ?? UNASSIGNED_KEY;
    const d = perDept.get(key) ?? { participantIds: new Set<string>(), phases: 0 };
    d.participantIds.add(ph.participantId);
    d.phases += 1;
    perDept.set(key, d);
  }

  for (const ids of chunk(toUpdate)) {
    await tx.appraisalParticipantPhase.updateMany({
      where: { id: { in: ids } },
      data: { deadlineOverride: p.newDueDate },
    });
  }

  const perDepartment = new Map<
    string,
    { participants: number; phases: number }
  >();
  perDept.forEach((v, k) =>
    perDepartment.set(k, { participants: v.participantIds.size, phases: v.phases }),
  );

  return {
    participantsAffected: affected.size,
    phasesExtended: toUpdate.length,
    phasesSkipped: skipped,
    perDepartment,
  };
}

// ---------------------------------------------------------------------------
// In-app notifications (Notification.userId is a StaffRecord id)
// ---------------------------------------------------------------------------
export const NOTIFICATION_TYPES = {
  APPRAISAL_REMINDER: "APPRAISAL_REMINDER",
  ESCALATION_ASSIGNED: "ESCALATION_ASSIGNED",
} as const;

export const ESCALATION_CATEGORY_LABELS: Record<
  AppraisalEscalationCategory,
  string
> = {
  OVERDUE_APPRAISAL: "Overdue appraisal",
  PERFORMANCE_DISPUTE: "Performance dispute",
  POLICY_VIOLATION: "Policy violation",
  SYSTEM_EXCEPTION: "System exception",
  PIP_ESCALATION: "PIP escalation",
};

export interface NotificationDraft {
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, string | number | boolean | null>;
}

/**
 * Inserts notifications for ACTIVE staff of this company only (anyone else is
 * dropped silently) and returns how many were created.
 */
export async function createNotifications(
  tx: Prisma.TransactionClient,
  p: { companyId: string; drafts: NotificationDraft[] },
): Promise<number> {
  if (p.drafts.length === 0) return 0;

  const ids = Array.from(new Set(p.drafts.map((d) => d.userId)));
  const active = new Set<string>();
  for (const part of chunk(ids)) {
    const rows = await tx.staffRecord.findMany({
      where: { id: { in: part }, companyId: p.companyId, isActive: true },
      select: { id: true },
    });
    rows.forEach((r) => active.add(r.id));
  }

  const data = p.drafts
    .filter((d) => active.has(d.userId))
    .map((d) => ({
      companyId: p.companyId,
      userId: d.userId,
      type: d.type,
      title: d.title,
      message: d.message,
      data: d.data,
    }));
  for (const part of chunk(data, 1000)) {
    await tx.notification.createMany({ data: part });
  }
  return data.length;
}

export async function notifyEscalationAssignee(
  tx: Prisma.TransactionClient,
  p: {
    companyId: string;
    assigneeId: string;
    escalationId: string;
    category: AppraisalEscalationCategory;
    cycleId: string | null;
    departmentName: string | null;
    assignedByName: string;
  },
) {
  const label = ESCALATION_CATEGORY_LABELS[p.category];
  await tx.notification.create({
    data: {
      companyId: p.companyId,
      userId: p.assigneeId,
      type: NOTIFICATION_TYPES.ESCALATION_ASSIGNED,
      title: "Escalation assigned to you",
      message: `${label} escalation${p.departmentName ? ` for ${p.departmentName}` : ""} was assigned to you by ${p.assignedByName}.`,
      data: {
        escalationId: p.escalationId,
        cycleId: p.cycleId,
        category: p.category,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// MASS_REMINDER planning
// Who is reminded follows AppraisalCycle.reminderRecipients (all three when it
// is empty, because HR explicitly asked for a reminder):
//   EMPLOYEE         participants whose SELF_APPRAISAL is still open
//   DIRECT_MANAGER   managers with MANAGER_REVIEWs waiting on them (the
//                    employee's self appraisal is done, or not part of the cycle)
//   DEPARTMENT_HEAD  one summary per department that still has pending work
// Departments already reminded within REMINDER_COOLDOWN_MINUTES are skipped.
// ---------------------------------------------------------------------------
export const REMINDER_COOLDOWN_MINUTES = 60;

export interface ReminderPlan {
  drafts: NotificationDraft[];
  pendingParticipants: number;
  perDepartment: Map<string, number>; // departmentKey -> participants with pending work
  recipients: { employees: number; managers: number; departmentHeads: number };
  skippedRecent: string[]; // department display names
}

export async function planReminders(
  tx: Prisma.TransactionClient,
  p: {
    companyId: string;
    cycle: CycleForOps;
    selection: EntitySelectionOk;
    message: string | null;
  },
): Promise<ReminderPlan> {
  const now = new Date();
  const type = NOTIFICATION_TYPES.APPRAISAL_REMINDER;
  const title = `Appraisal reminder: ${p.cycle.name}`;
  const suffix = p.message ? ` HR note: ${p.message}` : "";

  const cycleRow = await tx.appraisalCycle.findFirst({
    where: { id: p.cycle.id, companyId: p.companyId },
    select: { reminderRecipients: true },
  });
  const configured = new Set<AppraisalReminderRecipient>(
    cycleRow?.reminderRecipients ?? [],
  );
  if (configured.size === 0) {
    configured.add(AppraisalReminderRecipient.EMPLOYEE);
    configured.add(AppraisalReminderRecipient.DIRECT_MANAGER);
    configured.add(AppraisalReminderRecipient.DEPARTMENT_HEAD);
  }

  // Cooldown: departments already reminded recently are skipped.
  const since = new Date(now.getTime() - REMINDER_COOLDOWN_MINUTES * 60 * 1000);
  const recent = await tx.appraisalBulkOperation.findMany({
    where: {
      companyId: p.companyId,
      cycleId: p.cycle.id,
      action: "MASS_REMINDER",
      createdAt: { gte: since },
    },
    select: { departmentKeys: true },
  });
  const recentKeys = new Set<string>();
  recent.forEach((r) => r.departmentKeys.forEach((k) => recentKeys.add(k)));

  const participants = await tx.appraisalCycleParticipant.findMany({
    where: {
      ...p.selection.participantWhere,
      phases: { some: { status: { not: "COMPLETED" } } },
    },
    select: {
      staffRecordId: true,
      managerId: true,
      departmentId: true,
      phases: {
        select: { phaseType: true, status: true, deadlineOverride: true },
      },
    },
  });

  const heads = new Map<string, string>(); // departmentId -> head StaffRecord id
  if (
    configured.has(AppraisalReminderRecipient.DEPARTMENT_HEAD) &&
    p.selection.departmentIds.length
  ) {
    const depts = await tx.department.findMany({
      where: { id: { in: p.selection.departmentIds }, companyId: p.companyId },
      select: { id: true, head: { select: { id: true } } },
    });
    depts.forEach((d) => {
      if (d.head?.id) heads.set(d.id, d.head.id);
    });
  }

  const deadlineByType = new Map(
    p.cycle.phases.map((ph) => [ph.phaseType, ph.deadline] as const),
  );
  const effOf = (ph: {
    phaseType: (typeof p.cycle.phases)[number]["phaseType"];
    deadlineOverride: Date | null;
  }) => effectiveDeadline(ph.deadlineOverride, deadlineByType.get(ph.phaseType));

  const drafts: NotificationDraft[] = [];
  const perDepartment = new Map<string, number>();
  const deptOverdue = new Map<string, number>();
  const mgr = new Map<string, { pending: number; overdue: number }>();
  const skipped = new Set<string>();
  let pendingParticipants = 0;
  let employees = 0;

  for (const part of participants) {
    const key = part.departmentId ?? UNASSIGNED_KEY;
    if (recentKeys.has(key)) {
      skipped.add(p.selection.departmentNames.get(key) ?? "Department");
      continue;
    }
    const open = part.phases.filter((ph) => ph.status !== "COMPLETED");
    if (open.length === 0) continue;

    pendingParticipants += 1;
    perDepartment.set(key, (perDepartment.get(key) ?? 0) + 1);
    if (
      open.some((ph) => {
        const d = effOf(ph);
        return !!d && d < now;
      })
    )
      deptOverdue.set(key, (deptOverdue.get(key) ?? 0) + 1);

    const self = part.phases.find((ph) => ph.phaseType === "SELF_APPRAISAL");
    const review = part.phases.find((ph) => ph.phaseType === "MANAGER_REVIEW");

    if (
      configured.has(AppraisalReminderRecipient.EMPLOYEE) &&
      self &&
      self.status !== "COMPLETED"
    ) {
      const d = effOf(self);
      const late = !!d && d < now;
      drafts.push({
        userId: part.staffRecordId,
        type,
        title,
        message:
          (late
            ? "Your self-appraisal is overdue. Please complete it as soon as possible."
            : `Your self-appraisal is still pending.${d ? ` Due ${formatDay(d)}.` : ""}`) +
          suffix,
        data: { audience: "EMPLOYEE", cycleId: p.cycle.id, overdue: late },
      });
      employees += 1;
    }

    if (
      configured.has(AppraisalReminderRecipient.DIRECT_MANAGER) &&
      part.managerId &&
      review &&
      review.status !== "COMPLETED" &&
      (!self || self.status === "COMPLETED")
    ) {
      const d = effOf(review);
      const m = mgr.get(part.managerId) ?? { pending: 0, overdue: 0 };
      m.pending += 1;
      if (d && d < now) m.overdue += 1;
      mgr.set(part.managerId, m);
    }
  }

  mgr.forEach((m, managerId) => {
    drafts.push({
      userId: managerId,
      type,
      title,
      message:
        `${m.pending} manager review${m.pending === 1 ? " is" : "s are"} awaiting you` +
        `${m.overdue ? ` (${m.overdue} overdue)` : ""}.` +
        suffix,
      data: {
        audience: "DIRECT_MANAGER",
        cycleId: p.cycle.id,
        pendingCount: m.pending,
        overdueCount: m.overdue,
      },
    });
  });

  let departmentHeads = 0;
  perDepartment.forEach((n, key) => {
    const headId = heads.get(key); // the Unassigned bucket has no head
    if (!headId) return;
    const od = deptOverdue.get(key) ?? 0;
    const name = p.selection.departmentNames.get(key) ?? "your department";
    drafts.push({
      userId: headId,
      type,
      title,
      message:
        `${n} employee${n === 1 ? "" : "s"} in ${name} still ${n === 1 ? "has" : "have"} pending appraisal steps` +
        `${od ? ` (${od} overdue)` : ""}.` +
        suffix,
      data: {
        audience: "DEPARTMENT_HEAD",
        cycleId: p.cycle.id,
        departmentId: key,
        pendingCount: n,
        overdueCount: od,
      },
    });
    departmentHeads += 1;
  });

  return {
    drafts,
    pendingParticipants,
    perDepartment,
    recipients: { employees, managers: mgr.size, departmentHeads },
    skippedRecent: Array.from(skipped),
  };
}

// ---------------------------------------------------------------------------
// Shared MASS_REMINDER delivery: used by POST /bulk-operations and by the
// Cycles page "Remind" button (POST /appraisal-cycles/:id/remind), so both
// share one engine, one audit trail and one cooldown.
// ---------------------------------------------------------------------------
export type ReminderOutcome =
  | { error: string; status: number } // returned BEFORE any write happens
  | {
      affectedCount: number;
      delivered: number;
      departmentKeys: string[]; // only departments actually reminded (drives the cooldown)
      details: Prisma.InputJsonValue;
      notes: { departmentKey: string; message: string }[];
      extra: Record<string, unknown>;
      summary: string;
    };

export async function deliverReminders(
  tx: Prisma.TransactionClient,
  p: {
    companyId: string;
    cycle: CycleForOps;
    selection: EntitySelectionOk;
    actorName: string;
    message: string | null;
  },
): Promise<ReminderOutcome> {
  const plan = await planReminders(tx, {
    companyId: p.companyId,
    cycle: p.cycle,
    selection: p.selection,
    message: p.message,
  });
  if (plan.pendingParticipants === 0)
    return {
      error: plan.skippedRecent.length
        ? `Reminders were already sent for ${plan.skippedRecent.join(", ")} in the last ${REMINDER_COOLDOWN_MINUTES} minutes`
        : "No participants with pending work in the selected entities",
      status: 409,
    };

  const delivered = await createNotifications(tx, {
    companyId: p.companyId,
    drafts: plan.drafts,
  });
  if (delivered === 0)
    return {
      error:
        "No active recipients were found for the pending work in the selected entities",
      status: 409,
    };

  const entries = Array.from(plan.perDepartment.entries());
  const skippedText = plan.skippedRecent.length
    ? ` Skipped (reminded within the last ${REMINDER_COOLDOWN_MINUTES} minutes): ${plan.skippedRecent.join(", ")}.`
    : "";
  return {
    affectedCount: plan.pendingParticipants,
    delivered,
    departmentKeys: entries.map(([departmentKey]) => departmentKey),
    details: {
      delivered,
      recipients: plan.recipients,
      skippedRecent: plan.skippedRecent,
      perDepartment: entries.map(([departmentKey, pendingParticipants]) => ({
        departmentKey,
        pendingParticipants,
      })),
    },
    notes: entries.map(([departmentKey, n]) => ({
      departmentKey,
      message: `Reminder sent by ${p.actorName} (in-app) covering ${n} participant(s) with pending work.${p.message ? ` Message: "${p.message}"` : ""}`,
    })),
    extra: {
      delivered: true,
      channels: { inApp: delivered, email: 0 },
      recipients: plan.recipients,
      skippedRecent: plan.skippedRecent,
    },
    summary: `Reminder sent to ${delivered} recipient${delivered === 1 ? "" : "s"} in-app. Email delivery is not enabled.${skippedText}`,
  };
}

/** Selection covering every participant of a cycle (the Cycles page "Remind"). */
export async function resolveCycleWideSelection(
  companyId: string,
  cycleId: string,
): Promise<EntitySelectionOk> {
  const rows = await prisma.appraisalCycleParticipant.findMany({
    where: { cycleId, companyId },
    distinct: ["departmentId"],
    select: { departmentId: true },
  });
  const departmentIds = rows
    .map((r) => r.departmentId)
    .filter((x): x is string => !!x);
  const includesUnassigned = rows.some((r) => r.departmentId === null);
  const departments = departmentIds.length
    ? await prisma.department.findMany({
        where: { id: { in: departmentIds }, companyId },
        select: { id: true, name: true },
      })
    : [];
  const departmentNames = new Map<string, string>(
    departments.map((d) => [d.id, d.name] as const),
  );
  if (includesUnassigned) departmentNames.set(UNASSIGNED_KEY, "Unassigned");
  return {
    departmentIds,
    includesUnassigned,
    departmentKeys: includesUnassigned
      ? [...departmentIds, UNASSIGNED_KEY]
      : departmentIds,
    departmentNames,
    participantWhere: { cycleId, companyId },
  };
}

/**
 * Separation of duties for policy exceptions: whoever raised a request cannot
 * decide it. SUPER_ADMIN is exempt so a single-admin company cannot deadlock
 * (the audit row still records requester and decider).
 */
export const canDecideException = (
  requestedBy: string,
  actorId: string | null,
  role: string,
) => role === "SUPER_ADMIN" || requestedBy !== actorId;