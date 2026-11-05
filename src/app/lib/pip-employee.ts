import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { PipMilestoneStatus, PipSeverity } from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { handleApiError } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { Actor, Db, resolveActor } from "@/app/lib/manager-review";
import {
  DAY,
  LIVE_PIP,
  OPEN_PIP,
  fail,
  nameOf,
  parseDateOnly,
  pipLabel,
  pipScope,
  readText,
  startOfUtcDay,
  LIMITS,
  type PipCtx,
} from "@/app/lib/pip";
import { validAttachmentUrl } from "@/app/lib/feedback";

// ---------------------------------------------------------------------------
// Rules for the employee view and the objective, training and check-in routes
// ---------------------------------------------------------------------------
export const EMP_LIMITS = {
  objectives: 10,
  objectiveTitle: 200,
  objectiveField: 120,
  objectiveValue: 80,
  expectations: 1500,
  progressNote: 1000,
  reflection: 2000,
  supportMessage: 2000,
  supportResponse: 2000,
  openSupportRequests: 5,
  evidencePerObjective: 20,
  trainingTitle: 200,
  checkInNote: 1000,
} as const;

export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM"] as const;
export const SUPPORT_TYPES = [
  "COACHING_SESSION",
  "TECHNICAL_MENTORSHIP",
  "TRAINING_MATERIALS",
  "HR_CONSULTATION",
] as const;
export const SUPPORT_SCHEDULES = [
  "THIS_WEEK",
  "NEXT_WEEK",
  "WITHIN_TWO_WEEKS",
] as const;
const SEVERITY_WEIGHT: Record<PipSeverity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
};
const EMPLOYEE_ROLES = [
  "STAFF",
  "EMPLOYEE",
  "MANAGER",
  "HR",
  "ADMIN",
  "SUPER_ADMIN",
];

export type Params<T> = { params: Promise<T> };

// ---------------------------------------------------------------------------
// Error handling: throw anywhere (including inside a transaction), convert once
// ---------------------------------------------------------------------------
export class PipHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const bail = (status: number, message: string): never => {
  throw new PipHttpError(status, message);
};

export async function guarded(
  request: NextRequest,
  fn: (origin: string | null) => Promise<NextResponse>,
): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  try {
    return await fn(origin);
  } catch (e) {
    if (e instanceof PipHttpError) return fail(origin, e.message, e.status);
    return withCors(handleApiError(e), origin);
  }
}

export async function readBody(
  request: NextRequest,
): Promise<Record<string, any>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new PipHttpError(400, "Invalid JSON body");
  return body;
}

// ---------------------------------------------------------------------------
// Field readers (throw PipHttpError on bad input)
// ---------------------------------------------------------------------------
export function text(
  v: unknown,
  label: string,
  max: number,
  opts: { required?: boolean } = {},
): string | null {
  const r = readText(v, label, max, opts);
  if ("error" in r) throw new PipHttpError(400, r.error);
  return r.value;
}
export function intIn(v: unknown, label: string, min = 0, max = 100): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    throw new PipHttpError(
      400,
      `${label} must be a whole number between ${min} and ${max}`,
    );
  return v;
}
export function oneOf<T extends string>(
  v: unknown,
  list: readonly T[],
  label: string,
): T {
  if (typeof v !== "string" || !(list as readonly string[]).includes(v))
    throw new PipHttpError(400, `${label} must be one of: ${list.join(", ")}`);
  return v as T;
}

const FILE_EXT = /\.(pdf|jpe?g|png|zip)$/i;

// [{ fileName, fileUrl }] from POST /api/goals/uploads. Only this company's folder is accepted.
export function parseFiles(
  raw: unknown,
  companyId: string,
  max: number = LIMITS.files,
): { fileName: string; fileUrl: string }[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return bail(400, "files must be an array");
  if (raw.length > max)
    return bail(400, `You can attach at most ${max} files at a time`);
  const seen = new Set<string>();
  const out: { fileName: string; fileUrl: string }[] = [];
  for (const f of raw) {
    const fileName = typeof f?.fileName === "string" ? f.fileName.trim() : "";
    const fileUrl = typeof f?.fileUrl === "string" ? f.fileUrl.trim() : "";
    if (!fileName || fileName.length > 255 || !fileUrl)
      return bail(
        400,
        "Each file needs a fileName (max 255 characters) and a fileUrl",
      );
    if (!FILE_EXT.test(fileName))
      return bail(400, "Only PDF, JPG, PNG or ZIP files are allowed");
    if (!validAttachmentUrl(companyId, fileUrl))
      return bail(400, "Invalid file location");
    if (seen.has(fileUrl)) continue;
    seen.add(fileUrl);
    out.push({ fileName, fileUrl });
  }
  return out;
}

export function parseIdList(raw: unknown, label: string, max = 20): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || !x))
    return bail(400, `${label} must be an array of ids`);
  const ids = [...new Set(raw as string[])];
  return ids.length > max
    ? bail(400, `${label} can have at most ${max} items`)
    : ids;
}

export function dateOnly(v: unknown, label: string): Date {
  const d = parseDateOnly(v);
  if (!d) throw new PipHttpError(400, `${label} must be a date (YYYY-MM-DD)`);
  return d;
}

// ---------------------------------------------------------------------------
// Employee request context (same order as readCtx, but STAFF is allowed)
// ---------------------------------------------------------------------------
export type EmpCtx = {
  user: UserContext;
  actor: Actor;
  origin: string | null;
  companyId: string;
  staffId: string | null;
};

export async function employeeReadCtx(
  request: NextRequest,
  companyId: unknown,
): Promise<EmpCtx> {
  const origin = request.headers.get("origin");
  const authHeader = request.headers.get("authorization");
  if (!authHeader) throw new PipHttpError(401, "Authorization header missing");
  const user: UserContext = requireRole(
    authHeader.replace("Bearer ", ""),
    EMPLOYEE_ROLES,
  );
  if (typeof companyId !== "string" || !companyId)
    throw new PipHttpError(400, "Missing required field: companyId");
  if (!(await verifyCompanyAccess(user, companyId)))
    throw new PipHttpError(403, "Forbidden: No access to this company");
  const actor = await resolveActor(user, companyId);
  return { user, actor, origin, companyId, staffId: actor.staffRecordId };
}

export async function employeeWriteCtx(
  request: NextRequest,
  companyId: unknown,
): Promise<EmpCtx & { staffId: string }> {
  const ctx = await employeeReadCtx(request, companyId);
  if (!ctx.staffId)
    throw new PipHttpError(
      403,
      "A staff record in this company is required to perform this action",
    );
  return { ...ctx, staffId: ctx.staffId };
}

// The employee's own plan, never a draft, and live for writes
export async function ownLivePip(
  db: Db,
  ctx: { companyId: string; staffId: string },
  id: string,
) {
  const pip = await db.pip.findFirst({
    where: {
      id,
      companyId: ctx.companyId,
      staffRecordId: ctx.staffId,
      status: { not: "DRAFT" },
    },
  });
  if (!pip) return bail(404, "PIP not found");
  if (!LIVE_PIP.includes(pip.status))
    return bail(409, "This PIP is not active");
  return pip;
}

// A plan the manager / HR can act on (pipScope enforces direct reports vs company-wide)
export async function managedPip(
  db: Db,
  ctx: PipCtx & { staffId: string },
  id: string,
  need: "any" | "open" | "live",
) {
  const pip = await db.pip.findFirst({
    where: { id, companyId: ctx.companyId, ...pipScope(ctx.actor) },
  });
  if (!pip) return bail(404, "PIP not found");
  if (need === "open" && !OPEN_PIP.includes(pip.status))
    return bail(409, "This PIP is closed");
  if (need === "live" && !LIVE_PIP.includes(pip.status))
    return bail(409, "This PIP is not active");
  return pip;
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------
export const objectiveStatus = (p: number) =>
  p >= 80 ? "ON_TRACK" : p >= 55 ? "NEEDS_ATTENTION" : "AT_RISK";

// Weighted by severity (Critical 3, High 2, Medium 1); falls back to milestone share when no objectives exist
export function recoveryOf(
  objs: { severity: PipSeverity; progress: number }[],
  ms: { status: PipMilestoneStatus }[],
): number {
  if (objs.length) {
    let n = 0;
    let d = 0;
    for (const o of objs) {
      const w = SEVERITY_WEIGHT[o.severity];
      n += w * o.progress;
      d += w;
    }
    return Math.round(n / d);
  }
  return ms.length
    ? Math.round(
        (ms.filter((m) => m.status === "COMPLETED").length / ms.length) * 100,
      )
    : 0;
}

function recoveryAsOf(
  objs: {
    severity: PipSeverity;
    createdAt: Date;
    progressUpdates: { progress: number; createdAt: Date }[];
  }[],
  ms: { status: PipMilestoneStatus; completedAt: Date | null }[],
  at: Date,
): number {
  const existing = objs.filter((o) => o.createdAt <= at);
  if (existing.length) {
    let n = 0;
    let d = 0;
    for (const o of existing) {
      const w = SEVERITY_WEIGHT[o.severity];
      n +=
        w * (o.progressUpdates.find((u) => u.createdAt <= at)?.progress ?? 0); // updates are newest-first
      d += w;
    }
    return Math.round(n / d);
  }
  const done = ms.filter(
    (m) => m.status === "COMPLETED" && m.completedAt && m.completedAt <= at,
  ).length;
  return ms.length ? Math.round((done / ms.length) * 100) : 0;
}

export const mondayOf = (d: Date) =>
  new Date(startOfUtcDay(d).getTime() - ((d.getUTCDay() + 6) % 7) * DAY);

// ---------------------------------------------------------------------------
// Employee payload
// ---------------------------------------------------------------------------
export const EMPLOYEE_INCLUDE = {
  staffRecord: { select: { id: true, firstName: true, lastName: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  improvementObjectives: {
    where: { removedAt: null },
    orderBy: { displayOrder: "asc" as const },
    include: {
      progressUpdates: { orderBy: { createdAt: "desc" as const } },
      evidence: {
        where: { removedAt: null },
        orderBy: { createdAt: "desc" as const },
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  },
  milestones: {
    where: { removedAt: null },
    orderBy: [{ dueDate: "asc" as const }, { displayOrder: "asc" as const }],
  },
  trainings: {
    where: { removedAt: null },
    orderBy: { createdAt: "asc" as const },
  },
  sessions: {
    where: { status: { not: "CANCELLED" as const } },
    orderBy: { scheduledAt: "asc" as const },
  },
  supportRequests: { orderBy: { createdAt: "desc" as const } },
  weeklyCheckIns: { orderBy: { weekStart: "asc" as const } },
} satisfies Prisma.PipInclude;
export type EmployeePip = Prisma.PipGetPayload<{
  include: typeof EMPLOYEE_INCLUDE;
}>;

export type DraftRow = {
  improvementObjectiveId: string;
  progress: number;
  note: string | null;
  completedTaskIds: string[];
  evidence: Prisma.JsonValue | null;
  updatedAt: Date;
};

export function serializeEmployeePlan(
  pip: EmployeePip,
  o: { isOwner: boolean; now: Date; drafts?: DraftRow[] },
) {
  const { now, isOwner } = o;
  const drafts = o.drafts ?? [];
  const today = startOfUtcDay(now);
  const live = LIVE_PIP.includes(pip.status);
  const recovery = recoveryOf(pip.improvementObjectives, pip.milestones);

  const objectives = pip.improvementObjectives.map((ob) => ({
    id: ob.id,
    title: ob.title,
    competency: ob.competency,
    kpi: ob.kpi,
    baseline: ob.baseline,
    target: ob.target,
    expectations: ob.expectations,
    severity: ob.severity,
    progress: ob.progress,
    status: objectiveStatus(ob.progress),
    dueDate: ob.dueDate,
    remainingDays: ob.dueDate
      ? Math.ceil((ob.dueDate.getTime() - today.getTime()) / DAY)
      : null,
    tasks: pip.milestones
      .filter((m) => m.improvementObjectiveId === ob.id)
      .map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        status: m.status,
        dueDate: m.dueDate,
        completedAt: m.completedAt,
        isOverdue: m.status === "PENDING" && m.dueDate < today,
      })),
    trainings: pip.trainings
      .filter((t) => t.improvementObjectiveId === ob.id)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate,
      })),
    coachingCount: pip.sessions.filter(
      (s) => s.improvementObjectiveId === ob.id && s.status === "COMPLETED",
    ).length,
    recentUpdates: ob.progressUpdates.slice(0, 5).map((u) => ({
      progress: u.progress,
      previousProgress: u.previousProgress,
      note: u.note,
      createdAt: u.createdAt,
    })),
    evidence: ob.evidence.map((e) => ({
      id: e.id,
      fileName: e.fileName,
      fileUrl: e.fileUrl,
      createdAt: e.createdAt,
      uploadedByName: nameOf(e.uploadedBy),
    })),
    draft: (() => {
      const d = drafts.find((x) => x.improvementObjectiveId === ob.id);
      return d
        ? {
            progress: d.progress,
            note: d.note,
            completedTaskIds: d.completedTaskIds,
            evidence: Array.isArray(d.evidence) ? d.evidence : [],
            savedAt: d.updatedAt,
          }
        : null;
    })(),
  }));

  // Priority Focus Areas: objectives grouped by competency, weakest first
  const groups = new Map<string, number[]>();
  for (const ob of pip.improvementObjectives) {
    const k = ob.competency || ob.title;
    groups.set(k, [...(groups.get(k) ?? []), ob.progress]);
  }
  const focusAreas = [...groups.entries()]
    .map(([name, v]) => {
      const progress = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
      return {
        name,
        progress,
        label:
          progress < 55
            ? "NEEDS_WORK"
            : progress < 80
              ? "IMPROVING"
              : "ON_TRACK",
      };
    })
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 3);

  // Improvement Journey: activation, milestones, sessions, then the target date
  const events: {
    key: string;
    kind: "ACTIVATION" | "MILESTONE" | "SESSION" | "TARGET";
    refId: string | null;
    date: Date;
    title: string;
    description: string | null;
    type: "milestone" | "coaching";
    done: boolean;
    reflection?: string | null;
    isOverdue?: boolean;
  }[] = [];
  if (pip.activatedAt)
    events.push({
      key: "ACTIVATION",
      kind: "ACTIVATION",
      refId: null,
      date: pip.activatedAt,
      title: "PIP Initiated",
      description: "Plan activated.",
      type: "milestone",
      done: true,
    });
  for (const m of pip.milestones)
    events.push({
      key: `MILESTONE:${m.id}`,
      kind: "MILESTONE",
      refId: m.id,
      date: m.dueDate,
      title: m.title,
      description: m.description,
      type: "milestone",
      done: m.status === "COMPLETED",
      reflection: m.employeeReflection,
      isOverdue: m.status === "PENDING" && m.dueDate < today,
    });
  for (const s of pip.sessions)
    events.push({
      key: `SESSION:${s.id}`,
      kind: "SESSION",
      refId: s.id,
      date: s.scheduledAt,
      title: s.objectives,
      description: s.sharedWithEmployee ? s.notes : null, // notes stay private until the manager shares them
      type: "coaching",
      done: s.status === "COMPLETED",
      reflection: s.employeeReflection,
      isOverdue: s.status === "SCHEDULED" && s.scheduledAt < now,
    });
  events.push({
    key: "TARGET",
    kind: "TARGET",
    refId: null,
    date: pip.targetDate,
    title: "Final Evaluation",
    description: "Completion of the PIP and final assessment.",
    type: "milestone",
    done: pip.status === "COMPLETED",
  });
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  let currentSet = false;
  const timeline = events.map(({ done, ...e }) => {
    const status = done
      ? "completed"
      : !currentSet
        ? ((currentSet = true), "current")
        : "upcoming";
    return { ...e, status };
  });

  // Recovery trend from the manager's weekly check-ins
  const startWeek = mondayOf(pip.startDate).getTime();
  const trend = pip.weeklyCheckIns.map((c) => ({
    week: `Week ${Math.floor((c.weekStart.getTime() - startWeek) / (7 * DAY)) + 1}`,
    weekStart: c.weekStart,
    productivity: c.productivityScore,
    quality: c.qualityScore,
    recovery: c.recoveryScore,
    target: pip.targetScore,
  }));
  const first = trend[0];
  const last = trend[trend.length - 1];
  const spanWeeks =
    first && last
      ? (last.weekStart.getTime() - first.weekStart.getTime()) / (7 * DAY)
      : 0;
  const totalWeeks = Math.max(
    1,
    (pip.targetDate.getTime() - pip.startDate.getTime()) / (7 * DAY),
  );
  const nextReview = pip.milestones
    .filter((m) => m.status === "PENDING")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

  return {
    pip: {
      id: pip.id,
      label: pipLabel(pip.number),
      status: pip.status,
      outcome: pip.outcome,
      recovery,
      weeklyChange: live
        ? recovery -
          recoveryAsOf(
            pip.improvementObjectives,
            pip.milestones,
            new Date(now.getTime() - 7 * DAY),
          )
        : null,
      issueSummary: pip.issueSummary,
      objectivesText: pip.objectives,
      startDate: pip.startDate,
      targetDate: pip.targetDate,
      originalTargetDate: pip.originalTargetDate,
      daysRemaining: Math.max(
        0,
        Math.ceil((pip.targetDate.getTime() - today.getTime()) / DAY),
      ),
      nextReviewAt: nextReview?.dueDate ?? null,
      acknowledgedAt: pip.acknowledgedAt,
      managerName: nameOf(pip.manager),
      employeeName: nameOf(pip.staffRecord),
    },
    objectives,
    focusAreas,
    support: {
      sessionsCompleted: pip.sessions.filter((s) => s.status === "COMPLETED")
        .length,
      trainingsCompleted: pip.trainings.filter((t) => t.status === "COMPLETED")
        .length,
      trainingsTotal: pip.trainings.length,
      requests: pip.supportRequests.map((r) => ({
        id: r.id,
        type: r.type,
        message: r.message,
        status: r.status,
        response: r.response,
        createdAt: r.createdAt,
        respondedAt: r.respondedAt,
        improvementObjectiveId: r.improvementObjectiveId,
        preferredSchedule: r.preferredSchedule,
      })),
    },
    timeline,
    analytics: {
      trend,
      targetScore: pip.targetScore,
      velocity:
        trend.length >= 2 && spanWeeks > 0
          ? {
              actualPerWeek: +(
                (last.recovery - first.recovery) /
                spanWeeks
              ).toFixed(1),
              expectedPerWeek: +(pip.targetScore / totalWeeks).toFixed(1),
            }
          : null,
    },
    permissions: {
      isOwner,
      canAcknowledge: isOwner && live && !pip.acknowledgedAt,
      canUpdateProgress: isOwner && live,
      canRequestSupport: isOwner && live,
    },
  };
}
