import {
  Prisma,
  AppraisalCycleStatus,
  AppraisalReminderRecipient,
  ReviewPhaseType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { logCycleAction } from "./appraisal-cycle-utils";
import {
  CycleTransitionError,
  applyCycleTransition,
  getActivationBlockers,
} from "./cycle-transitions";
import { deadlineEndMs, localNowMs, todayKey, todayStart } from "./cycle-dates";
import {
  CYCLE_NOTIFICATION_TYPES as TYPE,
  NotificationRow,
  activeIds,
  bulkNotify,
  claimKeys,
  fmtDate,
  notifyCycleStarted,
  plural,
  releaseKeys,
} from "./cycle-notifications";
import { kickAutomation } from "@/app/lib/automation-events";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const OVERDUE_REPEAT_DAYS = 3; // overdue reminders repeat every 3 days
const REMINDER_PHASES: ReviewPhaseType[] = ["SELF_APPRAISAL", "MANAGER_REVIEW"];
const RUNNING: AppraisalCycleStatus[] = ["ACTIVE", "ESCALATED"];

const cycleSelect = Prisma.validator<Prisma.AppraisalCycleSelect>()({
  id: true,
  companyId: true,
  name: true,
  status: true,
  ownerId: true,
  remindersEnabled: true,
  reminderLeadHours: true,
  reminderRecipients: true,
  escalationEnabled: true,
  escalationThresholdHours: true,
  phases: {
    where: { enabled: true },
    select: { phaseType: true, deadline: true },
  },
});
type RunningCycle = Prisma.AppraisalCycleGetPayload<{
  select: typeof cycleSelect;
}>;

// ---------------------------------------------------------------------------
// 1. Auto-start: SCHEDULED cycles whose start date has arrived
// ---------------------------------------------------------------------------
async function notifyStartBlocked(
  cycle: {
    id: string;
    companyId: string;
    ownerId: string;
    name: string;
    startDate: Date | null;
  },
  blockers: string[],
) {
  const claimed = await claimKeys([
    {
      key: `autostart|${cycle.id}|${todayKey()}`,
      companyId: cycle.companyId,
      cycleId: cycle.id,
      kind: "AUTO_START_FAILED",
    },
  ]);
  if (claimed.size === 0) return;
  const extra = blockers.length > 1 ? ` (+${blockers.length - 1} more)` : "";
  await bulkNotify([
    {
      userId: cycle.ownerId,
      companyId: cycle.companyId,
      type: TYPE.AUTO_START_FAILED,
      title: "Appraisal cycle couldn't start",
      message: `"${cycle.name}" was due to start${cycle.startDate ? ` on ${fmtDate(cycle.startDate)}` : ""} but couldn't start automatically: ${blockers[0]}${extra}`,
      data: {
        cycleId: cycle.id,
        cycleName: cycle.name,
        blockers: blockers.slice(0, 5),
      },
    },
  ]);
}

async function autoStartDueCycles(companyId: string) {
  const due = await prisma.appraisalCycle.findMany({
    where: { companyId, status: "SCHEDULED", startDate: { lte: todayStart() } },
    include: {
      phases: true,
      departmentScopes: { select: { departmentId: true } },
    },
  });
  let started = 0;
  for (const cycle of due) {
    try {
      const blockers = await getActivationBlockers(
        prisma as any,
        cycle,
        "activate",
      );
      if (blockers.length > 0) {
        await notifyStartBlocked(cycle, blockers);
        continue;
      }
      await prisma.$transaction(
        (tx) =>
          applyCycleTransition(tx, {
            cycle,
            action: "activate",
            actorId: cycle.ownerId,
            auto: true,
          }),
        { timeout: 60000, maxWait: 10000 },
      );
      await notifyCycleStarted(cycle.id);
      kickAutomation(cycle.companyId);
      started++;
    } catch (err) {
      // Someone else activated it at the same moment: fine.
      if (!(err instanceof CycleTransitionError))
        console.error(`Auto-start failed for cycle ${cycle.id}:`, err);
    }
  }
  return started;
}

// ---------------------------------------------------------------------------
// 2. Escalation: cycle flips ACTIVE <-> ESCALATED, owner and department heads are told
// ---------------------------------------------------------------------------
async function setEscalation(
  c: RunningCycle,
  to: "ESCALATED" | "DEESCALATED",
  info: Record<string, unknown>,
) {
  const from: AppraisalCycleStatus =
    to === "ESCALATED" ? "ACTIVE" : "ESCALATED";
  const toStatus: AppraisalCycleStatus =
    to === "ESCALATED" ? "ESCALATED" : "ACTIVE";
  return prisma.$transaction(async (tx) => {
    const res = await tx.appraisalCycle.updateMany({
      where: { id: c.id, companyId: c.companyId, status: from },
      data: { status: toStatus, updatedBy: c.ownerId },
    });
    if (res.count === 0) return false; // someone paused/changed it first
    await logCycleAction(tx, {
      cycleId: c.id,
      companyId: c.companyId,
      action: to,
      actorId: c.ownerId,
      previousData: { status: from },
      newData: { status: toStatus, auto: true, ...info },
    });
    return true;
  });
}

export async function generateEscalations(scope: {
  companyId?: string;
  userId?: string;
}) {
  const nowMs = localNowMs();
  const weekBucket = Math.floor(nowMs / (7 * DAY));
  const cycles = await prisma.appraisalCycle.findMany({
    where: {
      status: { in: RUNNING },
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.userId
        ? {
            escalationEnabled: true,
            participants: { some: { departmentHeadId: scope.userId } },
          }
        : {}),
    },
    select: cycleSelect,
  });

  let flipped = 0;
  let notified = 0;

  for (const c of cycles) {
    let groups: {
      departmentId: string | null;
      departmentHeadId: string | null;
      count: number;
    }[] = [];
    const thresholdHours = c.escalationThresholdHours ?? 48;
    const thr = thresholdHours * HOUR;

    if (c.escalationEnabled) {
      // Escalated = unfinished and overdue for longer than the threshold, measured from the
      // end of the deadline day (their own extension, else the cycle's deadline).
      const overdueTypes = c.phases
        .filter((p) => p.deadline && nowMs >= deadlineEndMs(p.deadline) + thr)
        .map((p) => p.phaseType);
      const where: Prisma.AppraisalParticipantPhaseWhereInput = {
        status: { not: "COMPLETED" },
        OR: [
          ...(overdueTypes.length
            ? [{ deadlineOverride: null, phaseType: { in: overdueTypes } }]
            : []),
          { deadlineOverride: { lte: new Date(nowMs - DAY - thr) } },
        ],
      };
      const rows = await prisma.appraisalCycleParticipant.groupBy({
        by: ["departmentId", "departmentHeadId"],
        where: { cycleId: c.id, phases: { some: where } },
        _count: { _all: true },
      });
      groups = rows.map((g) => ({
        departmentId: g.departmentId,
        departmentHeadId: g.departmentHeadId,
        count: g._count._all,
      }));
    }
    const total = groups.reduce((n, g) => n + g.count, 0);

    // The cycle-level flip belongs to the company sweep, not to a single person's check.
    if (!scope.userId) {
      if (total > 0 && c.status === "ACTIVE") {
        if (
          await setEscalation(c, "ESCALATED", {
            overdueEmployees: total,
            thresholdHours,
          })
        ) {
          flipped++;
          const claimed = await claimKeys([
            {
              key: `esc|${c.id}|${todayKey()}`,
              companyId: c.companyId,
              cycleId: c.id,
              kind: "ESCALATION",
            },
          ]);
          if (claimed.size > 0) {
            notified += await bulkNotify([
              {
                userId: c.ownerId,
                companyId: c.companyId,
                type: TYPE.ESCALATED,
                title: "Appraisal cycle escalated",
                message: `"${c.name}" is escalated: ${plural(total, "employee")} ${total === 1 ? "is" : "are"} more than ${thresholdHours} hours overdue.`,
                data: {
                  cycleId: c.id,
                  cycleName: c.name,
                  count: total,
                  thresholdHours,
                },
              },
            ]);
          }
        }
      } else if (total === 0 && c.status === "ESCALATED") {
        if (await setEscalation(c, "DEESCALATED", { overdueEmployees: 0 }))
          flipped++;
      }
    }

    // Department heads get a weekly digest while their people stay overdue.
    if (total > 0 && c.reminderRecipients.includes("DEPARTMENT_HEAD")) {
      const mine = groups.filter(
        (g) =>
          g.departmentHeadId &&
          (!scope.userId || g.departmentHeadId === scope.userId),
      );
      const activeHeads = await activeIds(mine.map((g) => g.departmentHeadId!));
      const entries = mine
        .filter((g) => activeHeads.has(g.departmentHeadId!))
        .map((g) => ({
          ...g,
          key: `dept|${c.id}|${g.departmentId ?? "none"}|${weekBucket}`,
        }));
      if (entries.length > 0) {
        const claimed = await claimKeys(
          entries.map((e) => ({
            key: e.key,
            companyId: c.companyId,
            cycleId: c.id,
            kind: "DEPT_ESCALATION",
          })),
        );
        const fresh = entries.filter((e) => claimed.has(e.key));
        if (fresh.length > 0) {
          const deptIds = fresh
            .map((e) => e.departmentId)
            .filter((x): x is string => !!x);
          const depts = deptIds.length
            ? await prisma.department.findMany({
                where: { id: { in: deptIds } },
                select: { id: true, name: true },
              })
            : [];
          const deptName = new Map(depts.map((d) => [d.id, d.name]));
          const notes: NotificationRow[] = fresh.map((e) => ({
            userId: e.departmentHeadId!,
            companyId: c.companyId,
            type: TYPE.ESCALATED,
            title: "Overdue appraisals in your department",
            message: `${plural(e.count, "employee")} in ${e.departmentId ? (deptName.get(e.departmentId) ?? "your department") : "your area"} ${e.count === 1 ? "is" : "are"} more than ${thresholdHours} hours overdue in "${c.name}".`,
            data: {
              cycleId: c.id,
              cycleName: c.name,
              departmentId: e.departmentId,
              count: e.count,
              thresholdHours,
            },
          }));
          try {
            notified += await bulkNotify(notes);
          } catch (err) {
            await releaseKeys([...claimed]);
            throw err;
          }
        }
      }
    }
  }
  return { flipped, notified };
}

// ---------------------------------------------------------------------------
// 3. Reminders: due soon and overdue, for self-appraisals and manager reviews
// ---------------------------------------------------------------------------
interface Candidate {
  key: string;
  kind: "DUE" | "OVERDUE";
  recipient: string;
  cycle: RunningCycle;
  phaseType: ReviewPhaseType;
  deadline: Date;
  subject: string;
}

export async function generateReminders(scope: {
  companyId?: string;
  userId?: string;
}) {
  const nowMs = localNowMs();
  const cycles = await prisma.appraisalCycle.findMany({
    where: {
      status: { in: RUNNING },
      remindersEnabled: true,
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.userId
        ? {
            participants: {
              some: {
                OR: [
                  { staffRecordId: scope.userId },
                  { managerId: scope.userId },
                ],
              },
            },
          }
        : {}),
    },
    select: cycleSelect,
  });
  if (cycles.length === 0) return { notified: 0 };

  const byId = new Map(cycles.map((c) => [c.id, c]));
  const phaseDeadline = new Map<string, Date | null>();
  const windowConditions: Prisma.AppraisalParticipantPhaseWhereInput[] = [];
  for (const c of cycles) {
    const lead = c.reminderLeadHours * HOUR;
    const open: ReviewPhaseType[] = [];
    for (const p of c.phases) {
      phaseDeadline.set(`${c.id}|${p.phaseType}`, p.deadline);
      if (
        REMINDER_PHASES.includes(p.phaseType) &&
        p.deadline &&
        nowMs >= deadlineEndMs(p.deadline) - lead
      ) {
        open.push(p.phaseType);
      }
    }
    if (open.length)
      windowConditions.push({ cycleId: c.id, phaseType: { in: open } });
    // Individual extensions are always checked, since they can put someone in the window on their own.
    windowConditions.push({
      cycleId: c.id,
      phaseType: { in: REMINDER_PHASES },
      deadlineOverride: { not: null },
    });
  }

  const rows = await prisma.appraisalParticipantPhase.findMany({
    where: {
      status: { not: "COMPLETED" },
      OR: windowConditions,
      ...(scope.userId
        ? {
            participant: {
              OR: [
                { staffRecordId: scope.userId },
                { managerId: scope.userId },
              ],
            },
          }
        : {}),
    },
    select: {
      id: true,
      cycleId: true,
      phaseType: true,
      deadlineOverride: true,
      participant: {
        select: {
          staffRecordId: true,
          managerId: true,
          staffRecord: {
            select: { firstName: true, lastName: true, isActive: true },
          },
        },
      },
    },
  });

  const candidates: Candidate[] = [];
  for (const r of rows) {
    const c = byId.get(r.cycleId);
    if (!c) continue;
    const deadline =
      r.deadlineOverride ??
      phaseDeadline.get(`${r.cycleId}|${r.phaseType}`) ??
      null;
    if (!deadline) continue;
    const end = deadlineEndMs(deadline);
    if (nowMs < end - c.reminderLeadHours * HOUR) continue; // not in the window yet
    const overdue = nowMs >= end;

    const isSelf = r.phaseType === "SELF_APPRAISAL";
    const wanted: AppraisalReminderRecipient = isSelf
      ? "EMPLOYEE"
      : "DIRECT_MANAGER";
    if (!c.reminderRecipients.includes(wanted)) continue;
    const recipient = isSelf
      ? r.participant.staffRecordId
      : r.participant.managerId;
    if (!recipient || (scope.userId && recipient !== scope.userId)) continue;
    if (!r.participant.staffRecord.isActive) continue; // the employee has left

    const bucket = overdue
      ? Math.floor((nowMs - end) / (OVERDUE_REPEAT_DAYS * DAY))
      : 0;
    candidates.push({
      key: overdue ? `over|${r.id}|${bucket}` : `due|${r.id}`,
      kind: overdue ? "OVERDUE" : "DUE",
      recipient,
      cycle: c,
      phaseType: r.phaseType,
      deadline,
      subject: `${r.participant.staffRecord.firstName} ${r.participant.staffRecord.lastName}`,
    });
  }
  if (candidates.length === 0) return { notified: 0 };

  const activeManagers = await activeIds(
    candidates
      .filter((c) => c.phaseType === "MANAGER_REVIEW")
      .map((c) => c.recipient),
  );
  const eligible = candidates.filter(
    (c) => c.phaseType === "SELF_APPRAISAL" || activeManagers.has(c.recipient),
  );

  const claimed = await claimKeys(
    eligible.map((c) => ({
      key: c.key,
      companyId: c.cycle.companyId,
      cycleId: c.cycle.id,
      kind: c.kind === "OVERDUE" ? "OVERDUE" : "DUE_SOON",
    })),
  );
  const mine = eligible.filter((c) => claimed.has(c.key));
  if (mine.length === 0) return { notified: 0 };

  // One notification per person per cycle per kind, not one per review.
  const groups = new Map<string, Candidate[]>();
  for (const c of mine) {
    const k = `${c.recipient}|${c.cycle.id}|${c.phaseType}|${c.kind}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  const notifications: NotificationRow[] = [];
  for (const items of groups.values()) {
    const first = items[0];
    const n = items.length;
    const overdue = first.kind === "OVERDUE";
    const isSelf = first.phaseType === "SELF_APPRAISAL";
    const earliest = items.reduce(
      (a, i) => (i.deadline < a ? i.deadline : a),
      first.deadline,
    );
    const names =
      items
        .slice(0, 3)
        .map((i) => i.subject)
        .join(", ") + (n > 3 ? ` and ${n - 3} more` : "");
    const name = first.cycle.name;

    const title = isSelf
      ? overdue
        ? "Self-appraisal overdue"
        : "Self-appraisal due soon"
      : overdue
        ? "Manager reviews overdue"
        : "Manager reviews due soon";
    const message = isSelf
      ? overdue
        ? `Your self-appraisal for "${name}" was due ${fmtDate(earliest)}. Please complete it as soon as you can.`
        : `Your self-appraisal for "${name}" is due ${fmtDate(earliest)}.`
      : n === 1
        ? overdue
          ? `Your review of ${names} in "${name}" was due ${fmtDate(earliest)}.`
          : `Your review of ${names} in "${name}" is due ${fmtDate(earliest)}.`
        : overdue
          ? `${n} manager reviews in "${name}" are overdue (${names}). The earliest was due ${fmtDate(earliest)}.`
          : `${n} manager reviews in "${name}" are due soon (${names}). The earliest is due ${fmtDate(earliest)}.`;

    notifications.push({
      userId: first.recipient,
      companyId: first.cycle.companyId,
      type: overdue ? TYPE.OVERDUE : TYPE.DEADLINE_SOON,
      title,
      message,
      data: {
        cycleId: first.cycle.id,
        cycleName: name,
        phaseType: first.phaseType,
        role: isSelf ? "EMPLOYEE" : "MANAGER",
        count: n,
        deadline: earliest.toISOString(),
      },
    });
  }

  try {
    return { notified: await bulkNotify(notifications) };
  } catch (err) {
    await releaseKeys([...claimed]);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------
export async function runCycleSweep(companyId: string) {
  const result = { started: 0, flipped: 0, notified: 0 };
  try {
    result.started = await autoStartDueCycles(companyId);
  } catch (err) {
    console.error("Cycle auto-start failed:", err);
  }
  try {
    const e = await generateEscalations({ companyId });
    result.flipped = e.flipped;
    result.notified += e.notified;
  } catch (err) {
    console.error("Cycle escalation failed:", err);
  }
  try {
    const r = await generateReminders({ companyId });
    result.notified += r.notified;
  } catch (err) {
    console.error("Cycle reminders failed:", err);
  }
  return result;
}

// Company sweep, triggered when HR loads the cycle list or overview. Best-effort throttle (per
// server instance); the ledger and compare-and-set checks make repeated runs harmless anyway.
const lastSweep = new Map<string, number>();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export async function maybeRunCycleSweep(companyId: string, waitMs = 3000) {
  const last = lastSweep.get(companyId) ?? 0;
  if (Date.now() - last < SWEEP_INTERVAL_MS) return;
  lastSweep.set(companyId, Date.now());
  const run = runCycleSweep(companyId).catch((err) =>
    console.error("Cycle sweep failed:", err),
  );
  // Don't hold the page up if an activation takes a while; it keeps running.
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    run,
    new Promise((resolve) => (timer = setTimeout(resolve, waitMs))),
  ]);
  if (timer) clearTimeout(timer);
}

// Per-person check, triggered from the notifications endpoint for every role.
const lastUserRun = new Map<string, number>();
const USER_RUN_INTERVAL_MS = 30 * 60 * 1000;

export async function runCycleRemindersForUser(userId: string) {
  const last = lastUserRun.get(userId) ?? 0;
  if (Date.now() - last < USER_RUN_INTERVAL_MS) return;
  if (lastUserRun.size > 5000) lastUserRun.clear();
  lastUserRun.set(userId, Date.now());
  try {
    await generateReminders({ userId });
    await generateEscalations({ userId }); // department-head digests
  } catch (err) {
    console.error("Per-user cycle reminder run failed:", err);
  }
}
