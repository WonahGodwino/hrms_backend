import {
  Prisma,
  GoalAlignmentType,
  GoalLevel,
  GoalPerformanceCategory,
  GoalPriority,
  GoalStatus,
  KpiImpact,
  MilestoneStatus,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class ConflictError extends HttpError {
  constructor(
    message = "This record was changed by someone else. Refresh and try again.",
  ) {
    super(409, message);
  }
}

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------
export const VALID_PRIORITIES: GoalPriority[] = ["HIGH", "MEDIUM", "LOW"];
export const VALID_STATUSES: GoalStatus[] = [
  "ON_TRACK",
  "AT_RISK",
  "NEARING_COMPLETION",
  "BLOCKED",
  "COMPLETED",
];
export const VALID_LEVELS: GoalLevel[] = [
  "COMPANY",
  "DEPARTMENT",
  "TEAM",
  "INDIVIDUAL",
];
export const VALID_ALIGNMENT_TYPES: GoalAlignmentType[] = [
  "COMPANY_OKR",
  "DEPARTMENT_OBJECTIVE",
  "TEAM_INITIATIVE",
];
export const VALID_KPI_IMPACTS: KpiImpact[] = [
  "HIGH_IMPACT",
  "MEDIUM_IMPACT",
  "LOW_IMPACT",
];
export const VALID_PERFORMANCE_CATEGORIES: GoalPerformanceCategory[] = [
  "PRODUCTIVITY",
  "QUALITY",
  "COLLABORATION",
  "TIMELINESS",
  "INNOVATION",
  "LEADERSHIP",
];
export const VALID_MILESTONE_STATUSES: MilestoneStatus[] = [
  "PENDING",
  "ACTIVE",
  "COMPLETED",
];
export const LEVEL_RANK: Record<GoalLevel, number> = {
  COMPANY: 0,
  DEPARTMENT: 1,
  TEAM: 2,
  INDIVIDUAL: 3,
};

export const GOAL_HISTORY_ACTIONS = {
  CREATED: "CREATED",
  EDITED: "EDITED",
  STATUS_CHANGED: "STATUS_CHANGED",
  PROGRESS_UPDATED: "PROGRESS_UPDATED",
  MILESTONE_ADDED: "MILESTONE_ADDED",
  MILESTONE_STATUS_CHANGED: "MILESTONE_STATUS_CHANGED",
  MILESTONE_REMOVED: "MILESTONE_REMOVED",
  EVIDENCE_UPLOADED: "EVIDENCE_UPLOADED",
  COMMENT_ADDED: "COMMENT_ADDED",
  ARCHIVED: "ARCHIVED",
  UNARCHIVED: "UNARCHIVED",
  REASSIGNED: "REASSIGNED",
  REPARENTED: "REPARENTED",
  IMPACT_CHANGED: "IMPACT_CHANGED",
  KPI_ASSIGNED: "KPI_ASSIGNED",
  KPI_UPDATED: "KPI_UPDATED",
  KPI_ARCHIVED: "KPI_ARCHIVED",
  CONFLICT_RESOLVED: "CONFLICT_RESOLVED",
} as const;
export type GoalHistoryAction =
  (typeof GOAL_HISTORY_ACTIONS)[keyof typeof GOAL_HISTORY_ACTIONS];

// ---------------------------------------------------------------------------
// Input parsing (all throw HttpError 400)
// ---------------------------------------------------------------------------
const toKey = (v: unknown) =>
  typeof v === "string"
    ? v
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_")
    : "";

export const stripPrioritySuffix = (k: string) => k.replace(/_PRIORITY$/, "");

export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
  normalize: (k: string) => string = (k) => k,
): T {
  const k = normalize(toKey(value)) as T;
  if (!allowed.includes(k))
    throw new HttpError(
      400,
      `Invalid ${name}. Must be one of: ${allowed.join(", ")}`,
    );
  return k;
}

export function enumOr<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
  fallback: T,
  normalize?: (k: string) => string,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  return parseEnum(value, allowed, name, normalize);
}

export function optEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T | null {
  if (value === undefined || value === null || value === "") return null;
  return parseEnum(value, allowed, name);
}

export function parseStatusInput(value: unknown): GoalStatus {
  if (["DELAYED", "BEHIND", "NOT_STARTED", "CANCELLED"].includes(toKey(value)))
    throw new HttpError(
      400,
      `Status "${String(value)}" cannot be set. Delayed is calculated from the due date. Allowed: ${VALID_STATUSES.join(", ")}`,
    );
  return parseEnum(value, VALID_STATUSES, "status");
}

export function parseText(
  value: unknown,
  name: string,
  opts: { max: number; required?: boolean },
): string | null {
  if (value === undefined || value === null) {
    if (opts.required) throw new HttpError(400, `${name} is required`);
    return null;
  }
  if (typeof value !== "string")
    throw new HttpError(400, `${name} must be a string`);
  const t = value.trim();
  if (!t) {
    if (opts.required) throw new HttpError(400, `${name} is required`);
    return null;
  }
  if (t.length > opts.max)
    throw new HttpError(400, `${name} must be at most ${opts.max} characters`);
  return t;
}

export function parseNumber(
  value: unknown,
  name: string,
  opts: { positive?: boolean } = {},
): number {
  const n =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || (opts.positive && n <= 0))
    throw new HttpError(
      400,
      `${name} must be ${opts.positive ? "a positive number" : "a number"}`,
    );
  return n;
}

export function parseIntRange(
  value: unknown,
  name: string,
  min: number,
  max: number,
): number {
  const n = parseNumber(value, name);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new HttpError(
      400,
      `${name} must be a whole number between ${min} and ${max}`,
    );
  return n;
}

export const parseProgress = (value: unknown) =>
  parseIntRange(value, "progress", 0, 100);

export function parsePositiveInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---------------------------------------------------------------------------
// Calendar dates: stored at UTC midnight, overdue only once the day has ended
// in the company timezone (APPRAISAL_UTC_OFFSET_MINUTES, same as cycles).
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;
const OFFSET_MIN = Number.isFinite(
  Number(process.env.APPRAISAL_UTC_OFFSET_MINUTES),
)
  ? Number(process.env.APPRAISAL_UTC_OFFSET_MINUTES)
  : 0;

export function companyToday(now = new Date()): Date {
  const local = new Date(now.getTime() + OFFSET_MIN * 60_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}
export function daysUntil(due: Date | null, now = new Date()): number | null {
  if (!due) return null;
  return Math.round((due.getTime() - companyToday(now).getTime()) / DAY_MS);
}
export function isOverdue(due: Date | null, now = new Date()): boolean {
  return !!due && due.getTime() < companyToday(now).getTime();
}

// undefined = not provided, null = cleared, Date = UTC midnight of that day
export function parseDateOnly(
  value: unknown,
  name: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string")
    throw new HttpError(400, `${name} must be a date string`);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  let d: Date;
  if (m) {
    d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCMonth() !== +m[2] - 1)
      throw new HttpError(400, `${name} is not a valid date`);
  } else {
    const raw = new Date(value);
    if (Number.isNaN(raw.getTime()))
      throw new HttpError(400, `${name} is not a valid date`);
    d = new Date(
      Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()),
    );
  }
  if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100)
    throw new HttpError(400, `${name} is out of range`);
  return d;
}

// ---------------------------------------------------------------------------
// One status model
// ---------------------------------------------------------------------------
export const SCHEDULE_GRACE_POINTS = 20;

export function computeGoalStatus(
  g: {
    currentStatus: GoalStatus;
    progress: number;
    startDate: Date | null;
    dueDate: Date | null;
  },
  now = new Date(),
): GoalStatus {
  if (g.progress >= 100) return "COMPLETED";
  if (g.currentStatus === "BLOCKED") return "BLOCKED"; // sticky until cleared by hand
  if (g.progress >= 90) return "NEARING_COMPLETION";
  const today = companyToday(now).getTime();
  if (g.dueDate && g.dueDate.getTime() < today) return "AT_RISK";
  if (g.startDate && g.dueDate && g.dueDate > g.startDate) {
    const span = g.dueDate.getTime() - g.startDate.getTime();
    const elapsed = Math.min(
      1,
      Math.max(0, (today - g.startDate.getTime()) / span),
    );
    return g.progress < elapsed * 100 - SCHEDULE_GRACE_POINTS
      ? "AT_RISK"
      : "ON_TRACK";
  }
  return g.progress < 50 ? "AT_RISK" : "ON_TRACK";
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
export const asJson = (obj: Record<string, unknown>): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify(obj));

export async function logGoalAction(
  client: Prisma.TransactionClient,
  p: {
    goalId: string;
    companyId: string;
    action: GoalHistoryAction;
    actorId: string;
    previousData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
  },
) {
  return client.goalHistory.create({
    data: {
      goalId: p.goalId,
      companyId: p.companyId,
      action: p.action,
      actorId: p.actorId,
      previousData: p.previousData ? asJson(p.previousData) : undefined,
      newData: p.newData ? asJson(p.newData) : undefined,
    },
  });
}

// Collects only the fields that really change (for update + history rows)
export function createEditTracker(current: object) {
  const cur = current as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const prev: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  const same = (a: unknown, b: unknown) =>
    a instanceof Date && b instanceof Date
      ? a.getTime() === b.getTime()
      : a === b;
  return {
    data,
    prev,
    next,
    edit(key: string, value: unknown) {
      const before = cur[key] ?? null;
      const after = value ?? null;
      if (same(before, after)) return;
      data[key] = value;
      prev[key] = before;
      next[key] = after;
    },
    get changed() {
      return Object.keys(data).length > 0;
    },
  };
}

// ---------------------------------------------------------------------------
// The single progress writer (staff route and manager route both use it)
// ---------------------------------------------------------------------------
export async function applyGoalProgress(
  tx: Prisma.TransactionClient,
  a: {
    goal: {
      id: string;
      companyId: string;
      progress: number;
      status: GoalStatus;
      startDate: Date | null;
      dueDate: Date | null;
    };
    progress: number;
    notes: string | null;
    actorId: string;
    updatedBy: string;
    source: "SELF" | "MANAGER";
    keepBlocked?: boolean;
  },
) {
  const { goal } = a;
  const status = computeGoalStatus({
    currentStatus: a.keepBlocked ? "BLOCKED" : goal.status,
    progress: a.progress,
    startDate: goal.startDate,
    dueDate: goal.dueDate,
  });
  const wasCompleted = goal.status === "COMPLETED";
  // compare-and-set: two people saving at once cannot both win silently
  const cas = await tx.goal.updateMany({
    where: {
      id: goal.id,
      isArchived: false,
      progress: goal.progress,
      status: goal.status,
    },
    data: {
      progress: a.progress,
      status,
      updatedBy: a.updatedBy,
      completedAt:
        status === "COMPLETED" ? (wasCompleted ? undefined : new Date()) : null,
    },
  });
  if (cas.count !== 1)
    throw new ConflictError(
      "This goal was updated by someone else. Refresh and try again.",
    );

  const progressUpdate = await tx.goalProgressUpdate.create({
    data: {
      goalId: goal.id,
      progress: a.progress,
      notes: a.notes,
      actorId: a.actorId,
    },
  });
  await logGoalAction(tx, {
    goalId: goal.id,
    companyId: goal.companyId,
    action: GOAL_HISTORY_ACTIONS.PROGRESS_UPDATED,
    actorId: a.actorId,
    previousData: { progress: goal.progress, status: goal.status },
    newData: { progress: a.progress, status, source: a.source },
  });
  const updated = await tx.goal.findUniqueOrThrow({ where: { id: goal.id } });
  return { progressUpdate, goal: updated };
}

// ---------------------------------------------------------------------------
// KPI fields (create and update share one parser)
// ---------------------------------------------------------------------------
export function parseKpiFields(
  body: Record<string, unknown>,
  create: boolean,
): Prisma.KpiUncheckedUpdateManyInput {
  const out: Prisma.KpiUncheckedUpdateManyInput = {};
  if (create || body.name !== undefined)
    out.name = parseText(body.name, "name", {
      max: 255,
      required: true,
    }) as string;
  if (body.description !== undefined)
    out.description = parseText(body.description, "description", { max: 1000 });
  if (body.unit !== undefined)
    out.unit = parseText(body.unit, "unit", { max: 30 });
  if (create || body.targetValue !== undefined)
    out.targetValue = parseNumber(body.targetValue, "targetValue", {
      positive: true,
    });
  if (body.currentValue !== undefined)
    out.currentValue = parseNumber(body.currentValue, "currentValue");
  if (body.weight !== undefined)
    out.weight = parseIntRange(body.weight, "weight", 0, 100);
  if (body.impact !== undefined)
    out.impact = parseEnum(body.impact, VALID_KPI_IMPACTS, "impact");
  if (body.deadline !== undefined)
    out.deadline = parseDateOnly(body.deadline, "deadline");
  if (body.integrationSource !== undefined)
    out.integrationSource = parseText(
      body.integrationSource,
      "integrationSource",
      {
        max: 100,
      },
    );
  if (
    body.automatedTracking !== undefined &&
    typeof body.automatedTracking !== "boolean"
  )
    throw new HttpError(400, "automatedTracking must be a boolean");
  const auto =
    body.automatedTracking !== undefined
      ? (body.automatedTracking as boolean)
      : body.measurementMethod !== undefined
        ? /auto/i.test(String(body.measurementMethod))
        : undefined;
  if (auto !== undefined) {
    out.automatedTracking = auto;
    out.measurementMethod = auto ? "AUTOMATED" : "MANUAL";
  }
  return out;
}
