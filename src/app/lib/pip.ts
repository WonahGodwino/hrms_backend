import { NextRequest } from "next/server";
import { Prisma, PipIssueCategory } from "@prisma/client";
import type {
  PipKpiSnapshotKind,
  PipMilestoneStatus,
  PipSessionStatus,
  PipStatus,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { Actor, Db, kpiScore, resolveActor } from "@/app/lib/manager-review";

// ---------------------------------------------------------------------------
// Tunable rules, all in one place
// ---------------------------------------------------------------------------
export const OPEN_PIP: PipStatus[] = ["DRAFT", "ACTIVE", "ESCALATED"];
export const LIVE_PIP: PipStatus[] = ["ACTIVE", "ESCALATED"];
export const DAY = 86_400_000;
export const HELD_GRACE_MS = 5 * 60_000; // decision 24
export const PRIVACY_MIN_PEOPLE = 5; // decision 44
export const LIMITS = {
  minDays: 14,
  maxDays: 180,
  milestones: 20,
  sessions: 60,
  sessionItems: 10,
  openActionItems: 50,
  files: 5,
  objectives: 5000,
  issueSummary: 3000,
  milestoneTitle: 200,
  milestoneDesc: 1000,
  completionNote: 1000,
  sessionObjectives: 200,
  sessionNotes: 5000,
  itemTitle: 200,
  closureNote: 2000,
  extensionReason: 500,
  escalationReason: 2000,
  nextSteps: 1000,
  comment: 2000,
} as const;

// ---------------------------------------------------------------------------
// Responses and request context
// ---------------------------------------------------------------------------
export const fail = (origin: string | null, message: string, status = 400) =>
  withCors(ApiResponse.error(message, status), origin);
export const ok = (
  origin: string | null,
  data: unknown,
  message = "Success",
  status = 200,
) => withCors(ApiResponse.success(data, message, status), origin);
export const notFound = (origin: string | null, what = "PIP") =>
  withCors(ApiResponse.notFound(`${what} not found`), origin);

type Res = ReturnType<typeof fail>;
export type PipCtx = {
  user: UserContext;
  actor: Actor;
  origin: string | null;
  companyId: string;
  staffId: string | null;
};
type CtxResult<C> = { ok: true; ctx: C } | { ok: false; response: Res };

// Auth header, requireRole, verifyCompanyAccess, resolveActor (same order as every other module)
export async function readCtx(
  request: NextRequest,
  companyId: unknown,
): Promise<CtxResult<PipCtx>> {
  const origin = request.headers.get("origin");
  const authHeader = request.headers.get("authorization");
  if (!authHeader)
    return {
      ok: false,
      response: fail(origin, "Authorization header missing", 401),
    };
  const token = authHeader.replace("Bearer ", "");
  const user: UserContext = requireRole(token, [
    "MANAGER",
    "HR",
    "ADMIN",
    "SUPER_ADMIN",
  ]);
  if (typeof companyId !== "string" || !companyId)
    return {
      ok: false,
      response: fail(origin, "Missing required field: companyId"),
    };
  if (!(await verifyCompanyAccess(user, companyId)))
    return {
      ok: false,
      response: fail(origin, "Forbidden: No access to this company", 403),
    };
  const actor = await resolveActor(user, companyId);
  return {
    ok: true,
    ctx: { user, actor, origin, companyId, staffId: actor.staffRecordId },
  };
}

// Writes need a StaffRecord (createdById / actorId are required columns)
export async function writeCtx(
  request: NextRequest,
  companyId: unknown,
): Promise<CtxResult<PipCtx & { staffId: string }>> {
  const r = await readCtx(request, companyId);
  if (!r.ok) return r;
  if (!r.ctx.staffId)
    return {
      ok: false,
      response: fail(
        r.ctx.origin,
        "A staff record in this company is required to perform this action",
        403,
      ),
    };
  return { ok: true, ctx: { ...r.ctx, staffId: r.ctx.staffId } };
}

// ---------------------------------------------------------------------------
// Scope and permissions (decision 1)
// ---------------------------------------------------------------------------
export const pipScope = (a: Actor): Prisma.PipWhereInput =>
  a.companyWide
    ? {}
    : a.staffRecordId
      ? { managerId: a.staffRecordId }
      : { id: { in: [] } }; // never fall through to managerId: null

export const canAccessPip = (a: Actor, p: { managerId: string | null }) =>
  a.companyWide || (!!a.staffRecordId && p.managerId === a.staffRecordId);

export function pipPermissions(
  a: Actor,
  p: { status: PipStatus; managerId: string | null; createdById: string },
) {
  const me = a.staffRecordId;
  const manage = canAccessPip(a, p) && !!me;
  const draft = p.status === "DRAFT";
  const active = p.status === "ACTIVE";
  const escalated = p.status === "ESCALATED";
  const open = OPEN_PIP.includes(p.status);
  return {
    canEdit: manage && open,
    canActivate: manage && draft,
    canEditMilestones: manage && open,
    canAddSession: manage && (active || escalated),
    canEscalate:
      active &&
      !!me &&
      (a.companyWide || p.managerId === me || p.createdById === me),
    canComplete: manage && (active || (escalated && a.companyWide)),
    canCancel: draft ? manage || p.createdById === me : open && a.companyWide,
    canDownload: !!me,
  };
}

// ---------------------------------------------------------------------------
// Dates and text
// ---------------------------------------------------------------------------
export const startOfUtcDay = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function parseDateOnly(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const d = new Date(`${v.slice(0, 10)}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function parseInstant(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function validateRange(start: Date, target: Date): string | null {
  const days = Math.round((target.getTime() - start.getTime()) / DAY);
  if (days < LIMITS.minDays)
    return `The plan must run for at least ${LIMITS.minDays} days`;
  if (days > LIMITS.maxDays)
    return `The plan can run for at most ${LIMITS.maxDays} days`;
  return null;
}

export function readText(
  v: unknown,
  label: string,
  max: number,
  opts: { required?: boolean; min?: number } = {},
): { value: string | null } | { error: string } {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim()))
    return opts.required ? { error: `${label} is required` } : { value: null };
  if (typeof v !== "string") return { error: `${label} must be a string` };
  const s = v.trim();
  if (opts.min && s.length < opts.min)
    return { error: `${label} must be at least ${opts.min} characters` };
  if (s.length > max)
    return { error: `${label} must be at most ${max} characters` };
  return { value: s };
}

export function parseCategories(
  v: unknown,
): { value: PipIssueCategory[] } | { error: string } {
  if (v === undefined || v === null) return { value: [] };
  if (!Array.isArray(v)) return { error: "categories must be an array" };
  const valid = Object.values(PipIssueCategory) as string[];
  const bad = v.find((c) => typeof c !== "string" || !valid.includes(c));
  if (bad !== undefined)
    return { error: `categories must be from: ${valid.join(", ")}` };
  return { value: [...new Set(v as PipIssueCategory[])] };
}

export const activationError = (p: {
  objectives: string | null;
  issueSummary: string | null;
  categories: unknown[];
}) =>
  !p.categories.length
    ? "Select at least one issue category before activating"
    : !p.issueSummary
      ? "An issue summary is required before activating"
      : !p.objectives
        ? "Objectives and success criteria are required before activating"
        : null;

export const pipLabel = (n: number) => `PIP-${String(n).padStart(3, "0")}`;
type Person = { id: string; firstName: string; lastName: string };
export const nameOf = (s?: { firstName: string; lastName: string } | null) =>
  s ? `${s.firstName} ${s.lastName}`.trim() : null;
export const person = (s?: (Person & { avatarUrl?: string | null }) | null) =>
  s ? { id: s.id, name: nameOf(s), avatarUrl: s.avatarUrl ?? null } : null;

export function isUniqueViolation(e: unknown, field?: string) {
  if (
    !(e instanceof Prisma.PrismaClientKnownRequestError) ||
    e.code !== "P2002"
  )
    return false;
  if (!field) return true;
  const t = (e.meta as { target?: string | string[] } | undefined)?.target;
  return Array.isArray(t)
    ? t.includes(field)
    : !!t && String(t).includes(field);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
export async function logPip(
  db: Db,
  a: {
    pipId: string;
    companyId: string;
    action: string;
    actorId: string;
    previousData?: Prisma.InputJsonValue;
    newData?: Prisma.InputJsonValue;
  },
) {
  await db.pipHistory.create({
    data: {
      pipId: a.pipId,
      companyId: a.companyId,
      action: a.action,
      actorId: a.actorId,
      previousData: a.previousData ?? undefined,
      newData: a.newData ?? undefined,
    },
  });
}

export async function nextPipNumber(db: Db, companyId: string) {
  const agg = await db.pip.aggregate({
    where: { companyId },
    _max: { number: true },
  });
  return (agg._max.number ?? 0) + 1;
}

// Eligibility + frozen snapshots (decision 12)
export async function resolveSubject(
  db: Db,
  companyId: string,
  staffRecordId: string,
  actor: Actor,
  actorStaffId: string,
): Promise<
  | {
      subject: {
        id: string;
        managerId: string | null;
        roleTitle: string | null;
        designationId: string | null;
        departmentId: string | null;
        departmentName: string | null;
      };
    }
  | { error: string; status: number }
> {
  const s = await db.staffRecord.findFirst({
    where: { id: staffRecordId, companyId },
    select: {
      id: true,
      isActive: true,
      managerId: true,
      position: true,
      department: true,
      departmentId: true,
      departments: { select: { name: true } },
      designation: { select: { id: true, title: true } },
    },
  });
  if (!s || (!actor.companyWide && s.managerId !== actorStaffId))
    return { error: "Employee not found", status: 404 };
  if (!s.isActive) return { error: "This employee is not active", status: 409 };
  if (s.id === actorStaffId)
    return { error: "You cannot start a PIP on yourself", status: 403 };
  return {
    subject: {
      id: s.id,
      managerId: s.managerId,
      roleTitle: s.designation?.title ?? s.position ?? null,
      designationId: s.designation?.id ?? null,
      departmentId: s.departmentId,
      departmentName: s.departments?.name ?? s.department ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Card model: status, health, progress, next review (decisions 2, 3)
// ---------------------------------------------------------------------------
export const CARD_INCLUDE = {
  staffRecord: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
  manager: { select: { id: true, firstName: true, lastName: true } },
  milestones: {
    where: { removedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      displayOrder: true,
    },
  },
  sessions: {
    where: { status: "SCHEDULED" as const },
    orderBy: { scheduledAt: "asc" as const },
    take: 1,
    select: { id: true, scheduledAt: true, status: true },
  },
  escalations: {
    where: { status: { not: "RESOLVED" as const } },
    take: 1,
    select: { id: true, status: true, severity: true, createdAt: true },
  },
} satisfies Prisma.PipInclude;
export type CardPip = Prisma.PipGetPayload<{ include: typeof CARD_INCLUDE }>;

export type Risk = "HIGH" | "MEDIUM" | "LOW";

export function deriveHealth(
  p: Pick<CardPip, "status" | "startDate" | "targetDate">,
  ms: { status: PipMilestoneStatus; dueDate: Date }[],
  now: Date,
) {
  const total = ms.length;
  const done = ms.filter((m) => m.status === "COMPLETED").length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const today = startOfUtcDay(now);
  const overdue = ms.filter(
    (m) => m.status === "PENDING" && m.dueDate < today,
  ).length;
  const duration = p.targetDate.getTime() - p.startDate.getTime();
  const elapsed = Math.min(
    Math.max(now.getTime() - p.startDate.getTime(), 0),
    duration,
  );
  const expected = duration > 0 ? Math.round((elapsed / duration) * 100) : 0;
  const gap = expected - progress;
  const closed = !OPEN_PIP.includes(p.status);
  const pastTarget = !closed && today > p.targetDate;

  let risk: Risk | null = null;
  if (p.status !== "DRAFT" && !closed) {
    risk =
      p.status === "ESCALATED" || pastTarget || gap >= 30
        ? "HIGH"
        : gap >= 10 || overdue > 0
          ? "MEDIUM"
          : "LOW";
  }
  const health =
    p.status === "ESCALATED"
      ? "ESCALATED"
      : p.status === "DRAFT"
        ? "DRAFT"
        : closed
          ? null
          : risk === "LOW"
            ? "IMPROVING"
            : "AT_RISK";
  return {
    progress,
    expectedProgress: expected,
    milestoneTotal: total,
    milestoneCompleted: done,
    milestoneOverdue: overdue,
    pastTarget,
    risk,
    health: health as "ESCALATED" | "DRAFT" | "IMPROVING" | "AT_RISK" | null,
  };
}

export function serializeCard(p: CardPip, now = new Date()) {
  const h = deriveHealth(p, p.milestones, now);
  const today = startOfUtcDay(now);
  const pendingMs = p.milestones
    .filter((m) => m.status === "PENDING")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
  const session = p.sessions
    .filter((s) => s.status === "SCHEDULED")
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];
  const candidates = [
    pendingMs && {
      kind: "MILESTONE" as const,
      at: pendingMs.dueDate,
      isOverdue: pendingMs.dueDate < today,
      refId: pendingMs.id,
    },
    session && {
      kind: "SESSION" as const,
      at: session.scheduledAt,
      isOverdue: session.scheduledAt < now,
      refId: session.id,
    },
  ].filter((x): x is NonNullable<typeof x> => !!x);
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  const nextReview = OPEN_PIP.includes(p.status)
    ? (candidates[0] ?? null)
    : null;

  return {
    id: p.id,
    number: p.number,
    label: pipLabel(p.number),
    status: p.status,
    outcome: p.outcome,
    categories: p.categories,
    employee: person(p.staffRecord),
    roleTitle: p.roleTitle,
    departmentId: p.departmentId,
    departmentName: p.departmentName,
    managerId: p.managerId,
    managerName: nameOf(p.manager),
    startDate: p.startDate,
    targetDate: p.targetDate,
    originalTargetDate: p.originalTargetDate,
    activatedAt: p.activatedAt,
    closedAt: p.closedAt,
    progress: h.progress,
    expectedProgress: h.expectedProgress,
    milestones: {
      total: h.milestoneTotal,
      completed: h.milestoneCompleted,
      overdue: h.milestoneOverdue,
    },
    health: h.health,
    risk: h.risk,
    pastTarget: h.pastTarget,
    nextReview,
    hasOpenEscalation: p.escalations.some((e) => e.status !== "RESOLVED"),
  };
}

const RISK_RANK: Record<Risk, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
export function sortCards<
  T extends { risk: Risk | null; nextReview: { at: Date } | null },
>(cards: T[]) {
  const far = Number.MAX_SAFE_INTEGER;
  return cards.sort(
    (a, b) =>
      (a.risk ? RISK_RANK[a.risk] : 3) - (b.risk ? RISK_RANK[b.risk] : 3) ||
      (a.nextReview?.at.getTime() ?? far) - (b.nextReview?.at.getTime() ?? far),
  );
}

// Drawer milestone display status: first non-completed = Active (batch 2)
export function decorateMilestones<
  T extends {
    id: string;
    status: PipMilestoneStatus;
    dueDate: Date;
    displayOrder: number;
  },
>(ms: T[], today: Date) {
  const sorted = [...ms].sort(
    (a, b) =>
      a.dueDate.getTime() - b.dueDate.getTime() ||
      a.displayOrder - b.displayOrder,
  );
  const activeId = sorted.find((m) => m.status !== "COMPLETED")?.id ?? null;
  return sorted.map((m) => ({
    ...m,
    displayStatus:
      m.status === "COMPLETED"
        ? "COMPLETED"
        : m.id === activeId
          ? "ACTIVE"
          : "PENDING",
    isOverdue: m.status === "PENDING" && m.dueDate < today,
  }));
}

export const sessionDisplayStatus = (
  s: { status: PipSessionStatus; scheduledAt: Date },
  now: Date,
) =>
  s.status === "SCHEDULED"
    ? s.scheduledAt < now
      ? "OVERDUE"
      : "UPCOMING"
    : s.status;

export function serializeSession(
  s: {
    id: string;
    pipId: string;
    scheduledAt: Date;
    objectives: string;
    notes: string | null;
    status: PipSessionStatus;
    completedAt: Date | null;
    cancelledAt: Date | null;
    createdBy: Person;
    _count?: { actionItems: number };
  },
  now: Date,
) {
  return {
    id: s.id,
    pipId: s.pipId,
    scheduledAt: s.scheduledAt,
    objectives: s.objectives,
    notes: s.notes,
    status: s.status,
    displayStatus: sessionDisplayStatus(s, now),
    completedAt: s.completedAt,
    cancelledAt: s.cancelledAt,
    createdBy: person(s.createdBy),
    actionItemCount: s._count?.actionItems ?? 0,
  };
}

export const SESSION_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { actionItems: true } },
} satisfies Prisma.PipCoachingSessionInclude;

// ---------------------------------------------------------------------------
// KPI snapshots (decision 42). Never throws: the main action must still succeed.
// ---------------------------------------------------------------------------
export async function captureKpiSnapshot(
  pipId: string,
  kind: PipKpiSnapshotKind,
  actorId: string,
) {
  let companyId: string | null = null;
  try {
    const pip = await prisma.pip.findUnique({
      where: { id: pipId },
      select: { companyId: true, staffRecordId: true, startDate: true },
    });
    if (!pip) return;
    companyId = pip.companyId;
    const now = new Date();
    const emp = pip.staffRecordId;
    const goals = await prisma.goal.findMany({
      where: {
        companyId: pip.companyId,
        isArchived: false,
        AND: [
          {
            OR: [
              { staffRecordId: emp, assignedToId: null },
              { assignedToId: emp },
            ],
          },
          { OR: [{ dueDate: null }, { dueDate: { gte: pip.startDate } }] },
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        ],
      },
      select: { progress: true, kpiImpact: true },
    });
    const score = kpiScore(goals);
    if (score === null) return;
    if (kind === "CHECKPOINT") {
      const last = await prisma.pipKpiSnapshot.findFirst({
        where: { pipId },
        orderBy: { capturedAt: "desc" },
        select: { kpiScore: true, capturedAt: true },
      });
      if (
        last &&
        last.kpiScore === score &&
        now.getTime() - last.capturedAt.getTime() < DAY
      )
        return;
    }
    await prisma.pipKpiSnapshot.create({
      data: { pipId, kind, kpiScore: score, goalCount: goals.length },
    });
  } catch (e) {
    try {
      if (companyId)
        await logPip(prisma, {
          pipId,
          companyId,
          action: "KPI_SNAPSHOT_FAILED",
          actorId,
          newData: { kind, error: e instanceof Error ? e.message : "unknown" },
        });
    } catch {
      /* swallow */
    }
  }
}

// ---------------------------------------------------------------------------
// Escalation <-> PIP sync (decision 37). Call inside the same transaction
// as anything that changes an escalation's status.
// ---------------------------------------------------------------------------
export async function syncPipOnEscalationChange(
  tx: Db,
  p: {
    escalationId: string;
    companyId: string;
    actorId: string;
    status: "OPEN" | "IN_REVIEW" | "RESOLVED";
  },
) {
  if (p.status !== "RESOLVED") return; // IN_REVIEW leaves the PIP ESCALATED
  const esc = await tx.appraisalEscalation.findFirst({
    where: { id: p.escalationId, companyId: p.companyId },
    select: { pipId: true },
  });
  if (!esc?.pipId) return;
  await tx.appraisalEscalation.update({
    where: { id: p.escalationId },
    data: { pipOpenKey: null },
  });
  const flipped = await tx.pip.updateMany({
    where: { id: esc.pipId, companyId: p.companyId, status: "ESCALATED" },
    data: { status: "ACTIVE" },
  });
  if (flipped.count === 1)
    await logPip(tx, {
      pipId: esc.pipId,
      companyId: p.companyId,
      action: "DE_ESCALATED",
      actorId: p.actorId,
      previousData: { status: "ESCALATED" },
      newData: { status: "ACTIVE", escalationId: p.escalationId },
    });
}
