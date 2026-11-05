import { prisma } from "@/app/lib/db";
import { deadlineEndMs, localNowMs } from "./cycle-dates";

export const CYCLE_NOTIFICATION_TYPES = {
  STARTED: "APPRAISAL_CYCLE_STARTED",
  ADDED: "APPRAISAL_CYCLE_ADDED",
  DEADLINE_SOON: "APPRAISAL_CYCLE_DEADLINE_SOON",
  OVERDUE: "APPRAISAL_CYCLE_OVERDUE",
  ESCALATED: "APPRAISAL_CYCLE_ESCALATED",
  AUTO_START_FAILED: "APPRAISAL_CYCLE_AUTO_START_FAILED",
  REMINDER: "APPRAISAL_CYCLE_REMINDER",
} as const;
const TYPE = CYCLE_NOTIFICATION_TYPES;

export interface NotificationRow {
  userId: string;
  companyId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export const plural = (n: number, w: string) =>
  `${n} ${w}${n === 1 ? "" : "s"}`;
export const joinNames = (names: string[], max = 3) =>
  names.length <= max
    ? names.join(", ")
    : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;

const HOUR_MS = 3_600_000;
const INSERT_CHUNK = 500;
const KEY_CHUNK = 5000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Same row shape createNotification writes, but in bulk (a launch can mean thousands of rows).
export async function bulkNotify(rows: NotificationRow[]): Promise<number> {
  let created = 0;
  for (const part of chunk(rows, INSERT_CHUNK)) {
    const res = await prisma.notification.createMany({
      data: part.map((r) => ({
        userId: r.userId,
        companyId: r.companyId,
        type: r.type,
        title: r.title,
        message: r.message,
        read: false,
        ...(r.data && Object.keys(r.data).length
          ? { data: JSON.stringify(r.data) }
          : {}),
      })),
    });
    created += res.count;
  }
  return created;
}

// Returns the keys this call won. Anything already claimed (by anyone, ever) is skipped.
export async function claimKeys(
  entries: { key: string; companyId: string; cycleId: string; kind: string }[],
): Promise<Set<string>> {
  const claimed = new Set<string>();
  if (entries.length === 0) return claimed;
  const existing = new Set<string>();
  for (const part of chunk(
    entries.map((e) => e.key),
    KEY_CHUNK,
  )) {
    const rows = await prisma.appraisalAutomationLog.findMany({
      where: { dedupeKey: { in: part } },
      select: { dedupeKey: true },
    });
    rows.forEach((r) => existing.add(r.dedupeKey));
  }
  for (const e of entries) {
    if (existing.has(e.key)) continue;
    try {
      await prisma.appraisalAutomationLog.create({
        data: {
          companyId: e.companyId,
          cycleId: e.cycleId,
          kind: e.kind,
          dedupeKey: e.key,
        },
      });
      claimed.add(e.key);
    } catch (err: any) {
      if (err?.code !== "P2002") throw err; // lost a race to another run: it will send, we skip
    }
  }
  return claimed;
}

export async function releaseKeys(keys: string[]) {
  for (const part of chunk(keys, KEY_CHUNK)) {
    await prisma.appraisalAutomationLog.deleteMany({
      where: { dedupeKey: { in: part } },
    });
  }
}

export async function activeIds(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk([...new Set(ids)], KEY_CHUNK)) {
    const rows = await prisma.staffRecord.findMany({
      where: { id: { in: part }, isActive: true },
      select: { id: true },
    });
    rows.forEach((r) => out.add(r.id));
  }
  return out;
}

// Launch: every participant, every manager (one batched notice) and every peer reviewer (one batched notice).
export async function notifyCycleStarted(cycleId: string) {
  const cycle = await prisma.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      companyId: true,
      name: true,
      phases: {
        where: { enabled: true },
        select: { phaseType: true, deadline: true },
      },
    },
  });
  if (!cycle) return 0;
  const claimed = await claimKeys([
    {
      key: `started|${cycle.id}`,
      companyId: cycle.companyId,
      cycleId: cycle.id,
      kind: "STARTED",
    },
  ]);
  if (claimed.size === 0) return 0;

  const due = (t: string) =>
    cycle.phases.find((p) => p.phaseType === t)?.deadline ?? null;
  const selfDue = due("SELF_APPRAISAL");
  const managerDue = due("MANAGER_REVIEW");
  const peersOn = cycle.phases.some((p) => p.phaseType === "PEER_REVIEW");
  const base = { cycleId: cycle.id, cycleName: cycle.name };
  const rows: NotificationRow[] = [];

  const participants = await prisma.appraisalCycleParticipant.findMany({
    where: { cycleId: cycle.id, staffRecord: { isActive: true } },
    select: { staffRecordId: true, managerId: true },
  });
  for (const p of participants) {
    rows.push({
      userId: p.staffRecordId,
      companyId: cycle.companyId,
      type: TYPE.STARTED,
      title: "Appraisal cycle started",
      message: selfDue
        ? `"${cycle.name}" has started. Your self-appraisal is due ${fmtDate(selfDue)}.`
        : `"${cycle.name}" has started and you're taking part.`,
      data: {
        ...base,
        role: "EMPLOYEE",
        phaseType: selfDue ? "SELF_APPRAISAL" : null,
        deadline: selfDue ? selfDue.toISOString() : null,
      },
    });
  }

  if (managerDue) {
    const team = new Map<string, number>();
    for (const p of participants)
      if (p.managerId) team.set(p.managerId, (team.get(p.managerId) ?? 0) + 1);
    const activeManagers = await activeIds([...team.keys()]);
    for (const [managerId, n] of team) {
      if (!activeManagers.has(managerId)) continue;
      rows.push({
        userId: managerId,
        companyId: cycle.companyId,
        type: TYPE.STARTED,
        title: "Appraisal cycle started",
        message: `"${cycle.name}" has started. You have ${plural(n, "manager review")} to complete, due ${fmtDate(managerDue)}.`,
        data: {
          ...base,
          role: "MANAGER",
          phaseType: "MANAGER_REVIEW",
          count: n,
          deadline: managerDue.toISOString(),
        },
      });
    }
  }

  if (peersOn) {
    const reviewers = await prisma.appraisalPeerAssignment.groupBy({
      by: ["reviewerStaffId"],
      where: { cycleId: cycle.id },
      _count: { _all: true },
    });
    const activeReviewers = await activeIds(
      reviewers.map((r) => r.reviewerStaffId),
    );
    const peerDue = due("PEER_REVIEW");
    for (const r of reviewers) {
      if (!activeReviewers.has(r.reviewerStaffId)) continue;
      rows.push({
        userId: r.reviewerStaffId,
        companyId: cycle.companyId,
        type: TYPE.STARTED,
        title: "You're a peer reviewer",
        message: `You've been asked to give peer feedback on ${plural(r._count._all, "colleague")} in "${cycle.name}"${peerDue ? `, due ${fmtDate(peerDue)}` : ""}.`,
        data: {
          ...base,
          role: "PEER",
          phaseType: "PEER_REVIEW",
          count: r._count._all,
          deadline: peerDue ? peerDue.toISOString() : null,
        },
      });
    }
  }

  try {
    return await bulkNotify(rows);
  } catch (err) {
    await releaseKeys([...claimed]);
    throw err;
  }
}

// Someone enrolled after launch (late joiner, or restored after an exclusion).
export async function notifyJoiners(cycleId: string, staffRecordIds: string[]) {
  if (staffRecordIds.length === 0) return 0;
  const cycle = await prisma.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      companyId: true,
      name: true,
      phases: {
        where: { enabled: true, phaseType: "SELF_APPRAISAL" },
        select: { deadline: true },
      },
    },
  });
  if (!cycle) return 0;
  const selfDue = cycle.phases[0]?.deadline ?? null;
  return bulkNotify(
    staffRecordIds.map((id) => ({
      userId: id,
      companyId: cycle.companyId,
      type: TYPE.ADDED,
      title: "Added to an appraisal cycle",
      message: selfDue
        ? `You've been added to "${cycle.name}". Your self-appraisal is due ${fmtDate(selfDue)}.`
        : `You've been added to "${cycle.name}".`,
      data: {
        cycleId: cycle.id,
        cycleName: cycle.name,
        role: "EMPLOYEE",
        phaseType: selfDue ? "SELF_APPRAISAL" : null,
        deadline: selfDue ? selfDue.toISOString() : null,
      },
    })),
  );
}

// The HR "Remind" button: nudge everyone who still owes a self-appraisal or manager review.
// Limited to once an hour per cycle so a double-click or a keen admin can't spam people.
export async function sendManualReminders(cycleId: string) {
  const none = { remindersSent: 0, recipients: 0, throttled: false };
  const cycle = await prisma.appraisalCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      companyId: true,
      name: true,
      phases: {
        where: { enabled: true },
        select: { phaseType: true, deadline: true },
      },
    },
  });
  if (!cycle) return none;

  const rows = await prisma.appraisalParticipantPhase.findMany({
    where: {
      cycleId,
      status: { not: "COMPLETED" },
      phaseType: { in: ["SELF_APPRAISAL", "MANAGER_REVIEW"] },
      participant: { staffRecord: { isActive: true } },
    },
    select: {
      phaseType: true,
      deadlineOverride: true,
      participant: {
        select: {
          staffRecordId: true,
          managerId: true,
          staffRecord: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (rows.length === 0) return none;

  const claimed = await claimKeys([
    {
      key: `manual|${cycle.id}|${Math.floor(Date.now() / HOUR_MS)}`,
      companyId: cycle.companyId,
      cycleId: cycle.id,
      kind: "MANUAL",
    },
  ]);
  if (claimed.size === 0) return { ...none, throttled: true };

  const nowMs = localNowMs();
  const phaseDeadline = new Map(
    cycle.phases.map((p) => [p.phaseType as string, p.deadline]),
  );
  const when = (due: Date | null) =>
    !due
      ? "is still open"
      : nowMs >= deadlineEndMs(due)
        ? `was due ${fmtDate(due)}`
        : `is due ${fmtDate(due)}`;
  const base = { cycleId: cycle.id, cycleName: cycle.name };
  const out: NotificationRow[] = [];

  for (const r of rows) {
    if (r.phaseType !== "SELF_APPRAISAL") continue;
    const due =
      r.deadlineOverride ?? phaseDeadline.get("SELF_APPRAISAL") ?? null;
    out.push({
      userId: r.participant.staffRecordId,
      companyId: cycle.companyId,
      type: TYPE.REMINDER,
      title: "Reminder: self-appraisal",
      message: `HR sent a reminder: your self-appraisal for "${cycle.name}" ${when(due)}.`,
      data: {
        ...base,
        role: "EMPLOYEE",
        phaseType: "SELF_APPRAISAL",
        deadline: due ? due.toISOString() : null,
      },
    });
  }

  const byManager = new Map<
    string,
    { names: string[]; earliest: Date | null }
  >();
  for (const r of rows) {
    if (r.phaseType !== "MANAGER_REVIEW" || !r.participant.managerId) continue;
    const due =
      r.deadlineOverride ?? phaseDeadline.get("MANAGER_REVIEW") ?? null;
    const entry = byManager.get(r.participant.managerId) ?? {
      names: [],
      earliest: null,
    };
    entry.names.push(
      `${r.participant.staffRecord.firstName} ${r.participant.staffRecord.lastName}`,
    );
    if (due && (!entry.earliest || due < entry.earliest)) entry.earliest = due;
    byManager.set(r.participant.managerId, entry);
  }
  const activeManagers = await activeIds([...byManager.keys()]);
  for (const [managerId, e] of byManager) {
    if (!activeManagers.has(managerId)) continue;
    const n = e.names.length;
    out.push({
      userId: managerId,
      companyId: cycle.companyId,
      type: TYPE.REMINDER,
      title: "Reminder: manager reviews",
      message:
        n === 1
          ? `HR sent a reminder: your review of ${e.names[0]} in "${cycle.name}" ${when(e.earliest)}.`
          : `HR sent a reminder: ${n} manager reviews in "${cycle.name}" are waiting for you (${joinNames(e.names)}). Earliest ${when(e.earliest)}.`,
      data: {
        ...base,
        role: "MANAGER",
        phaseType: "MANAGER_REVIEW",
        count: n,
        deadline: e.earliest ? e.earliest.toISOString() : null,
      },
    });
  }

  if (out.length === 0) {
    await releaseKeys([...claimed]);
    return none;
  }
  try {
    const created = await bulkNotify(out);
    return {
      remindersSent: created,
      recipients: new Set(out.map((o) => o.userId)).size,
      throttled: false,
    };
  } catch (err) {
    await releaseKeys([...claimed]);
    throw err;
  }
}
