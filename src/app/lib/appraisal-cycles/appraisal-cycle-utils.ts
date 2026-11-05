import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  AppraisalCycleType,
  AppraisalCycleStatus,
  AppraisalCycleScopeType,
  ReviewPhaseType,
  ApprovalRoutingType,
  AppraisalCycle
} from "@prisma/client";

export const VALID_CYCLE_TYPES: AppraisalCycleType[] = [
  "ANNUAL",
  "BI_ANNUAL",
  "QUARTERLY",
  "PROJECT_BASED",
  "OTHER",
];

export const VALID_CYCLE_STATUSES: AppraisalCycleStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "ESCALATED",
  "COMPLETED",
  "ARCHIVED",
];

export const VALID_SCOPE_TYPES: AppraisalCycleScopeType[] = [
  "ALL_DEPARTMENTS",
  "SPECIFIC_DEPARTMENTS",
];

export const VALID_PHASE_TYPES: ReviewPhaseType[] = [
  "SELF_APPRAISAL",
  "MANAGER_REVIEW",
  "PEER_REVIEW",
  "LEADERSHIP_CALIBRATION",
  "HR_VALIDATION",
];

export const VALID_ROUTING_TYPES: ApprovalRoutingType[] = [
  "MANAGER_SKIPLEVEL_HR",
  "MANAGER_HR",
  "MANAGER_DEPTHEAD_HR",
];

export const CYCLE_HISTORY_ACTIONS = [
  "CREATED",
  "EDITED",
  "ACTIVATED",
  "SCHEDULED",
  "PAUSED",
  "RESUMED",
  "COMPLETED",
  "ARCHIVED",
  "RESTORED",
  "ESCALATED",
  "REMINDER_SENT",
  "REPORT_EXPORTED",
  "PEER_MATRIX_GENERATED",
  "PEER_ADDED",
  "PEER_REMOVED",
  "TEMPLATE_ASSIGNED",
  "TEMPLATE_UNASSIGNED",
  "PARTICIPANTS_SYNCED",
  "PARTICIPANT_EXCLUDED",
  "PARTICIPANT_RESTORED",
  "DEESCALATED",
] as const;

export type CycleAction =
  | "activate"
  | "schedule"
  | "pause"
  | "resume"
  | "complete"
  | "archive"
  | "restore";

export type CycleHistoryAction = (typeof CYCLE_HISTORY_ACTIONS)[number];

// Statuses from which each transition is legal. Mirrors the row-menu's
// conditional actions in AppraisalCycleWorkspace (Pause/Resume only show for
// Active/Escalated) and the modal's step-3 footer (Activate/Schedule only
// make sense from DRAFT).
export const TRANSITIONS: Record<CycleAction, AppraisalCycleStatus[]> = {
  activate: ["DRAFT", "SCHEDULED"],
  schedule: ["DRAFT"],
  pause: ["ACTIVE", "ESCALATED"],
  resume: ["PAUSED"],
  complete: ["ACTIVE", "ESCALATED"],
  archive: ["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "ESCALATED", "COMPLETED"],
  restore: ["ARCHIVED"],
};

export type EditMode = "full" | "limited" | "readonly";

// Cycles that still accept template changes. Once a cycle runs, its forms are pinned.
export const ASSIGNABLE_CYCLE_STATUSES: AppraisalCycleStatus[] = ["DRAFT", "SCHEDULED"];

// Single source of truth for what a status allows. The UI renders from this.
export function getCycleCapabilities(status: AppraisalCycleStatus) {
  const editMode: EditMode =
    status === "DRAFT" || status === "SCHEDULED"
      ? "full"
      : status === "ACTIVE" || status === "PAUSED" || status === "ESCALATED"
        ? "limited"
        : "readonly";
  return {
    allowedActions: (Object.keys(TRANSITIONS) as CycleAction[]).filter((a) =>
      TRANSITIONS[a].includes(status),
    ),
    editMode,
    canAssignTemplates: ASSIGNABLE_CYCLE_STATUSES.includes(status),
  };
}

export const dayKey = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? "invalid" : new Date(t).toISOString().slice(0, 10);
};

export const PHASE_LABEL: Record<string, string> = {
  SELF_APPRAISAL: "Self Appraisal",
  MANAGER_REVIEW: "Manager Review",
  PEER_REVIEW: "Peer Review",
  LEADERSHIP_CALIBRATION: "Leadership Calibration",
  HR_VALIDATION: "HR Validation",
};

type CycleSnapshot = AppraisalCycle & {
  departmentScopes: { department: { name: string } }[];
  phases: {
    phaseType: string;
    enabled: boolean;
    deadline: Date | null;
    displayOrder: number;
  }[];
};

const DIFF_SCALARS = [
  "name",
  "type",
  "customType",
  "scopeType",
  "approvalRouting",
  "requireHrSignoff",
  "autoAdvanceApprovals",
  "remindersEnabled",
  "reminderLeadHours",
  "escalationEnabled",
  "escalationThresholdHours",
  "peersPerEmployee",
  "minTenureMonths",
] as const;

const phaseSummary = (phases: CycleSnapshot["phases"]) =>
  [...phases]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .filter((p) => p.enabled)
    .map(
      (p) =>
        `${PHASE_LABEL[p.phaseType] ?? p.phaseType} (${p.deadline ? dayKey(p.deadline) : "no deadline"})`,
    );

// Only the fields that actually changed, in the same shape the drawer renders.
export function diffCycle(before: CycleSnapshot, after: CycleSnapshot) {
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  const note = (key: string, from: unknown, to: unknown) => {
    previous[key] = from;
    next[key] = to;
  };

  for (const k of DIFF_SCALARS)
    if (before[k] !== after[k]) note(k, before[k], after[k]);
  for (const k of ["startDate", "endDate"] as const) {
    if (dayKey(before[k]) !== dayKey(after[k]))
      note(k, dayKey(before[k]), dayKey(after[k]));
  }
  const recipients = (c: CycleSnapshot) => [...c.reminderRecipients].sort();
  if (recipients(before).join() !== recipients(after).join()) {
    note("reminderRecipients", recipients(before), recipients(after));
  }
  const deptNames = (c: CycleSnapshot) =>
    c.departmentScopes.map((d) => d.department.name).sort();
  if (deptNames(before).join("|") !== deptNames(after).join("|")) {
    note("departments", deptNames(before), deptNames(after));
  }
  const bp = phaseSummary(before.phases);
  const ap = phaseSummary(after.phases);
  if (bp.join("|") !== ap.join("|")) note("phases", bp, ap);

  return Object.keys(next).length ? { previous, next } : null;
}

// Dates must be coherent whenever they are saved or launched.
export function validateCycleWindow(input: {
  startDate: Date | null;
  endDate: Date | null;
  phases: { phaseType: string; enabled: boolean; deadline: Date | null }[];
}): string[] {
  const dates = [
    input.startDate,
    input.endDate,
    ...input.phases.map((p) => p.deadline),
  ];
  if (dates.some((d) => d && Number.isNaN(d.getTime())))
    return ["One or more dates are invalid."];
  const errors: string[] = [];
  const start = dayKey(input.startDate);
  const end = dayKey(input.endDate);
  if (start && end && end < start)
    errors.push("The end date can't be before the start date.");
  for (const p of input.phases) {
    if (!p.enabled || !p.deadline) continue;
    const d = dayKey(p.deadline)!;
    const label = PHASE_LABEL[p.phaseType] ?? p.phaseType;
    if (start && d < start)
      errors.push(`${label} deadline is before the cycle start.`);
    else if (end && d > end)
      errors.push(`${label} deadline is after the cycle end.`);
  }
  return errors;
}

type CycleForLockCheck = {
  type: string;
  customType: string | null;
  scopeType: string;
  startDate: Date | null;
  approvalRouting: string;
  requireHrSignoff: boolean;
  autoAdvanceApprovals: boolean;
  peersPerEmployee: number;
  departmentScopes: { departmentId: string }[];
  phases: { phaseType: string; enabled: boolean }[];
  minTenureMonths: number;
};

// For ACTIVE/PAUSED/ESCALATED cycles: returns the locked fields the request actually CHANGES.
// Unchanged values are ignored, because the edit modal always resends the whole form.
export function getLockedFieldChanges(
  existing: CycleForLockCheck,
  body: any,
): string[] {
  const out: string[] = [];
  const has = (k: string) => body[k] !== undefined;
  const upper = (v: unknown) => String(v).toUpperCase();

  if (has("type")) {
    const t = upper(body.type).replace(/-/g, "_");
    if (t !== existing.type) out.push("type");
    else if (
      t === "OTHER" &&
      String(body.customType ?? "").trim() !== (existing.customType ?? "")
    )
      out.push("customType");
  }
  const effScope = has("scopeType")
    ? upper(body.scopeType)
    : existing.scopeType;
  if (has("scopeType") && effScope !== existing.scopeType)
    out.push("scopeType");
  if (
    effScope === "SPECIFIC_DEPARTMENTS" &&
    Array.isArray(body.departmentIds)
  ) {
    const next = [...new Set<string>(body.departmentIds)].sort().join(",");
    const prev = existing.departmentScopes
      .map((d) => d.departmentId)
      .sort()
      .join(",");
    if (next !== prev) out.push("departments");
  }
  if (has("startDate") && dayKey(body.startDate) !== dayKey(existing.startDate))
    out.push("startDate");
  if (
    has("approvalRouting") &&
    upper(body.approvalRouting) !== existing.approvalRouting
  )
    out.push("approvalRouting");
  for (const k of [
    "requireHrSignoff",
    "autoAdvanceApprovals",
    "peersPerEmployee",
    "minTenureMonths",
  ] as const) {
    if (has(k) && body[k] !== existing[k]) out.push(k);
  }
  if (Array.isArray(body.phases)) {
    const prev = new Map(
      existing.phases.map((p) => [p.phaseType as string, p.enabled]),
    );
    const changed = body.phases.some(
      (p: any) => Boolean(prev.get(upper(p.phaseType))) !== (p.enabled ?? true),
    );
    if (changed) out.push("enabled phases");
  }
  return out;
}

const tenureCutoff = (start: Date, months: number) => {
  const d = new Date(start);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
};

export function eligibleStaffWhere(cycle: {
  companyId: string;
  scopeType: AppraisalCycleScopeType;
  departmentIds: string[];
  minTenureMonths?: number;
  startDate?: Date | null;
  excludedStaffIds?: string[];
}): Prisma.StaffRecordWhereInput {
  const cutoff =
    cycle.minTenureMonths && cycle.startDate
      ? tenureCutoff(cycle.startDate, cycle.minTenureMonths)
      : null;
  return {
    companyId: cycle.companyId,
    isActive: true,
    ...(cycle.scopeType === "SPECIFIC_DEPARTMENTS"
      ? { departmentId: { in: cycle.departmentIds } }
      : {}),
    ...(cycle.excludedStaffIds?.length
      ? { id: { notIn: cycle.excludedStaffIds } }
      : {}),
    // Hired too recently to appraise. Employees with no hire date on file are kept.
    ...(cutoff
      ? { OR: [{ hireDate: null }, { hireDate: { lte: cutoff } }] }
      : {}),
  };
}

export async function loadExcludedStaffIds(
  client: Prisma.TransactionClient,
  cycleId: string,
) {
  const rows = await client.appraisalCycleExclusion.findMany({
    where: { cycleId },
    select: { staffRecordId: true },
  });
  return rows.map((r) => r.staffRecordId);
}

interface LogCycleActionParams {
  cycleId: string;
  companyId: string;
  action: CycleHistoryAction;
  actorId: string;
  previousData?: any;
  newData?: any;
}

export async function logCycleAction(
  client: Prisma.TransactionClient,
  {
    cycleId,
    companyId,
    action,
    actorId,
    previousData,
    newData,
  }: LogCycleActionParams,
) {
  return client.appraisalCycleHistory.create({
    data: {
      cycleId,
      companyId,
      action,
      actorId,
      previousData: previousData ?? undefined,
      newData: newData ?? undefined,
    },
  });
}

export const LIVE_STATUSES: AppraisalCycleStatus[] = ["ACTIVE", "ESCALATED"];

// Maps backend phase types to the four keys AppraisalCycleWorkspace's
// progress bar already renders. LEADERSHIP_CALIBRATION has no bar segment.
export const PHASE_PROGRESS_KEY: Partial<
  Record<ReviewPhaseType, "self" | "manager" | "peer" | "hr">
> = {
  SELF_APPRAISAL: "self",
  MANAGER_REVIEW: "manager",
  PEER_REVIEW: "peer",
  HR_VALIDATION: "hr",
};

export const clampInt = (
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
) =>
  Math.min(
    max,
    Math.max(min, parseInt(raw ?? String(fallback), 10) || fallback),
  );

interface PhaseStat {
  completed: number;
  total: number;
  percent: number;
}
export interface CycleProgress {
  progress: { self: number; manager: number; peer: number; hr: number };
  metrics: { completed: number; total: number };
  phaseStats: Partial<Record<ReviewPhaseType, PhaseStat>>;
}

/**
 * Real progress numbers for one or more cycles, derived from participant rows.
 * "completed" participants = enrolled AND every one of their phases is COMPLETED.
 */
export async function getCycleProgressMap(
  cycleIds: string[],
): Promise<Map<string, CycleProgress>> {
  const result = new Map<string, CycleProgress>();
  cycleIds.forEach((id) =>
    result.set(id, {
      progress: { self: 0, manager: 0, peer: 0, hr: 0 },
      metrics: { completed: 0, total: 0 },
      phaseStats: {},
    }),
  );
  if (!cycleIds.length) return result;

  const [phaseGroups, totals, completedGroups] = await Promise.all([
    prisma.appraisalParticipantPhase.groupBy({
      by: ["cycleId", "phaseType", "status"],
      where: { cycleId: { in: cycleIds } },
      _count: { _all: true },
    }),
    prisma.appraisalCycleParticipant.groupBy({
      by: ["cycleId"],
      where: { cycleId: { in: cycleIds } },
      _count: { _all: true },
    }),
    // One query for every cycle: participants who have phases and none left to finish.
    prisma.appraisalCycleParticipant.groupBy({
      by: ["cycleId"],
      where: {
        cycleId: { in: cycleIds },
        phases: { some: {}, none: { status: { not: "COMPLETED" } } },
      },
      _count: { _all: true },
    }),
  ]);

  totals.forEach((t) => (result.get(t.cycleId)!.metrics.total = t._count._all));
  completedGroups.forEach(
    (g) => (result.get(g.cycleId)!.metrics.completed = g._count._all),
  );

  const tally = new Map<string, { completed: number; total: number }>();
  phaseGroups.forEach((g) => {
    const key = `${g.cycleId}:${g.phaseType}`;
    const t = tally.get(key) ?? { completed: 0, total: 0 };
    t.total += g._count._all;
    if (g.status === "COMPLETED") t.completed += g._count._all;
    tally.set(key, t);
  });

  tally.forEach((t, key) => {
    const [cycleId, phaseType] = key.split(":") as [string, ReviewPhaseType];
    const entry = result.get(cycleId)!;
    const percent = t.total ? Math.round((t.completed / t.total) * 100) : 0;
    entry.phaseStats[phaseType] = { ...t, percent };
    const barKey = PHASE_PROGRESS_KEY[phaseType];
    if (barKey) entry.progress[barKey] = percent;
  });

  return result;
}
