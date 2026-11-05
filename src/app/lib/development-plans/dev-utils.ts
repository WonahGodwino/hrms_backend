import { NextRequest } from "next/server";
import type {
  CompetencyCategory,
  DevelopmentPlanStatus,
  Prisma,
} from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  resolveActorStaffId,
  type UserContext,
} from "@/app/lib/access-control";
import { resolveRatingBounds } from "@/app/lib/self-appraisal";
import { resolveRatingScales } from "@/app/lib/manager-review";

export const HR_ROLES = ["HR", "ADMIN", "SUPER_ADMIN"];
// Who can be a mentor/coach: line managers and HR/Admin (the employee's own manager is always allowed)
export const COACH_ELIGIBLE_ROLES = ["MANAGER", ...HR_ROLES];
export const UPCOMING_WINDOW_DAYS = 14;
export const MAX_MILESTONES = 20;
export const MAX_TITLE = 200;
export const MAX_TEXT = 2000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_COLOR = "#137FEC";
const CATEGORY_COLORS: Record<CompetencyCategory, string> = {
  CORE: "#137FEC",
  LEADERSHIP: "#8B5CF6",
  TECHNICAL: "#F59E0B",
  BEHAVIORAL: "#22C55E",
  COMPLIANCE: "#EC4899",
  OTHER: "#137FEC",
};

export const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

export const nameOf = (
  s?: { firstName: string; lastName: string } | null,
): string | null => (s ? `${s.firstName} ${s.lastName}`.trim() : null);

// ---------------------------------------------------------------------------
// Auth: header, role, company access, acting staff record (all roles may use
// their own plans; STAFF/MANAGER are scoped to themselves via resolveSubject)
// ---------------------------------------------------------------------------
export interface DevAuth {
  user: UserContext;
  actorId: string;
  companyId: string;
  isHr: boolean;
}

export async function authorize(
  request: NextRequest,
  companyId: string | null | undefined,
): Promise<{ ok: true; auth: DevAuth } | { ok: false; response: Response }> {
  const origin = request.headers.get("origin");
  const fail = async (message: string, status: number) => ({
    ok: false as const,
    response: await withCors(ApiResponse.error(message, status), origin),
  });

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return await fail("Authorization header missing", 401);
  const token = authHeader.replace("Bearer ", "");
  let user: UserContext;
  try {
    user = requireRole(token, [
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);
  } catch (err: any) {
    return await fail(err?.message || "Unauthorized", 401);
  }
  if (!companyId || typeof companyId !== "string")
    return await fail("Missing required field: companyId", 400);
  if (!(await verifyCompanyAccess(user, companyId)))
    return await fail("Forbidden: No access to this company", 403);
  const actorId = await resolveActorStaffId(user, companyId);
  if (!actorId)
    return await fail(
      "A staff record in this company is required to perform this action",
      403,
    );
  return {
    ok: true,
    auth: { user, actorId, companyId, isHr: HR_ROLES.includes(user.role) },
  };
}

/** Whose plans? STAFF/MANAGER always their own; HR/Admin may name an employee of this company. */
export async function resolveSubject(
  a: DevAuth,
  requested?: string | null,
): Promise<string | null> {
  if (!requested || requested === a.actorId || !a.isHr) return a.actorId;
  const s = await prisma.staffRecord.findFirst({
    where: { id: requested, companyId: a.companyId },
    select: { id: true },
  });
  return s?.id ?? null;
}

export const canRead = (
  a: DevAuth,
  p: { staffRecordId: string; mentorId: string | null },
) => a.isHr || p.staffRecordId === a.actorId || p.mentorId === a.actorId;
export const canWrite = (a: DevAuth, p: { staffRecordId: string }) =>
  a.isHr || p.staffRecordId === a.actorId;

// ---------------------------------------------------------------------------
// Dates and inputs
// "YYYY-MM-DD" is stored as the END of that day (UTC), so a plan due "today"
// is not overdue until the day is over.
// ---------------------------------------------------------------------------
export function parseDate(input: unknown): Date | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const s = input.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(dateOnly ? `${s}T23:59:59.999Z` : s);
  if (Number.isNaN(d.getTime())) return null;
  if (dateOnly && d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

export function parseMilestoneInput(
  m: any,
): { title: string; dueDate: Date | null } | null {
  const title = typeof m?.title === "string" ? m.title.trim() : "";
  if (!title || title.length > MAX_TITLE) return null;
  const dueDate = m.dueDate ? parseDate(m.dueDate) : null;
  if (m.dueDate && !dueDate) return null;
  return { title, dueDate };
}

// ---------------------------------------------------------------------------
// Plan loading and serialization (shape matches the existing list/drawer props)
// ---------------------------------------------------------------------------
export const PLAN_INCLUDE = {
  competency: { select: { id: true, name: true, category: true } },
  mentor: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
  milestones: {
    orderBy: [{ displayOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
  activities: { orderBy: { displayOrder: "asc" as const } },
} satisfies Prisma.DevelopmentPlanInclude;

export type PlanRow = Prisma.DevelopmentPlanGetPayload<{
  include: typeof PLAN_INCLUDE;
}>;

export async function loadPlan(id: string, companyId: string) {
  return prisma.developmentPlan.findFirst({
    where: { id, companyId, status: { not: "ARCHIVED" } },
    include: PLAN_INCLUDE,
  });
}

export function derivedStatus(p: {
  status: DevelopmentPlanStatus;
  targetDate: Date | null;
}): "Active" | "Completed" | "Overdue" | "Archived" {
  if (p.status === "COMPLETED") return "Completed";
  if (p.status === "ARCHIVED") return "Archived";
  return p.targetDate && p.targetDate < new Date() ? "Overdue" : "Active";
}

export function serializePlan(p: PlanRow) {
  const done = p.milestones.filter((m) => m.isDone).length;
  const dueTimes = p.milestones
    .filter((m) => !m.isDone && m.dueDate)
    .map((m) => (m.dueDate as Date).getTime())
    .sort((a, b) => a - b);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    competencyId: p.competencyId,
    competency: p.competency?.name ?? "General",
    color: p.competency
      ? (CATEGORY_COLORS[p.competency.category] ?? DEFAULT_COLOR)
      : DEFAULT_COLOR,
    careerAlignment: p.careerAlignment ?? "Core Competency",
    status: derivedStatus(p),
    progress: p.progress,
    milestones: `${done}/${p.milestones.length} Completed`,
    milestoneCount: p.milestones.length,
    milestonesDone: done,
    startDate: p.startDate,
    dueDate: p.targetDate,
    nextCheckpoint: dueTimes.length ? new Date(dueTimes[0]) : null,
    mentorId: p.mentorId,
    mentor: nameOf(p.mentor) ?? "Unassigned",
    mentorImage: p.mentor?.avatarUrl ?? null,
    activities: p.activities.map((a) => ({
      id: a.id,
      type: a.type,
      label: a.title,
      status: a.status,
    })),
    milestoneList: p.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      dueDate: m.dueDate,
      done: m.isDone,
      completedAt: m.completedAt,
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Progress: milestones drive it when any exist; otherwise manual.
// Reaching 100 completes the plan; dropping below 100 reopens it.
// ---------------------------------------------------------------------------
export function computeProgress(
  milestones: { isDone: boolean }[],
  manual: number,
) {
  if (milestones.length === 0) return manual;
  return Math.round(
    (milestones.filter((m) => m.isDone).length / milestones.length) * 100,
  );
}

export async function settleProgress(
  tx: Prisma.TransactionClient,
  plan: { id: string; status: DevelopmentPlanStatus; progress: number },
  milestones: { isDone: boolean }[],
  manual: number | null,
) {
  const progress = computeProgress(milestones, manual ?? plan.progress);
  let status = plan.status;
  let transition: "COMPLETED" | "REOPENED" | null = null;
  if (progress >= 100 && plan.status === "ACTIVE") {
    status = "COMPLETED";
    transition = "COMPLETED";
  } else if (progress < 100 && plan.status === "COMPLETED") {
    status = "ACTIVE";
    transition = "REOPENED";
  }
  const now = new Date();
  await tx.developmentPlan.update({
    where: { id: plan.id },
    data: {
      progress,
      status,
      completedAt:
        status === "COMPLETED"
          ? plan.status === "COMPLETED"
            ? undefined
            : now
          : null,
    },
  });

  // Keep the plan's activity chips in step with the plan
  if (transition === "COMPLETED") {
    await tx.developmentPlanActivity.updateMany({
      where: { planId: plan.id, status: { not: "COMPLETED" } },
      data: { status: "COMPLETED", completedAt: now },
    });
  } else if (transition === "REOPENED") {
    // Only undo completions that happened with the plan, not earlier ones
    const last = await tx.developmentPlanHistory.findFirst({
      where: { planId: plan.id, action: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (last)
      await tx.developmentPlanActivity.updateMany({
        where: {
          planId: plan.id,
          status: "COMPLETED",
          completedAt: { gte: new Date(last.createdAt.getTime() - 60_000) },
        },
        data: { status: "PLANNED", completedAt: null },
      });
  }
  return { progress, status, transition };
}
// ---------------------------------------------------------------------------
// Audit and notifications
// Every history row that changes progress carries newData.progress, which the
// summary route uses to rebuild "progress 30 days ago".
// ---------------------------------------------------------------------------
export async function logDevAction(
  tx: Prisma.TransactionClient,
  p: {
    planId: string;
    companyId: string;
    actorId: string;
    action: string;
    note?: string | null;
    previousData?: Prisma.InputJsonValue;
    newData?: Prisma.InputJsonValue;
  },
) {
  return tx.developmentPlanHistory.create({
    data: {
      planId: p.planId,
      companyId: p.companyId,
      actorId: p.actorId,
      action: p.action,
      note: p.note ?? null,
      previousData: p.previousData,
      newData: p.newData,
    },
  });
}

export async function notifyStaff(
  tx: Prisma.TransactionClient,
  p: {
    companyId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    data: Record<string, string | number | boolean | null>;
  },
) {
  await tx.notification.create({
    data: {
      companyId: p.companyId,
      userId: p.userId,
      type: p.type,
      title: p.title,
      message: p.message,
      data: p.data,
    },
  });
}

/** Active staff of this company who may coach/mentor: eligible role, or the employee's own manager. */
export async function findEligibleCoach(
  companyId: string,
  coachId: string,
  subjectId: string,
  subjectManagerId: string | null,
) {
  if (coachId === subjectId) return null;
  const coach = await prisma.staffRecord.findFirst({
    where: { id: coachId, companyId, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  if (!coach) return null;
  return COACH_ELIGIBLE_ROLES.includes(coach.role) ||
    coach.id === subjectManagerId
    ? coach
    : null;
}

/** Display name from a model whose exact field I could not verify (title vs name). */
export const pickName = (
  obj: unknown,
  keys: string[],
  fallback: string,
): string => {
  const rec = (obj ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
};

export const formatDay = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Competency position: the employee's latest SUBMITTED manager rating per
// competency (calibrated first) against the level required for their
// designation / department (the higher of the two). Shared by /summary
// (Role Readiness) and /analytics so both screens show the same number.
// ---------------------------------------------------------------------------
export interface CompetencyPosition {
  competencyId: string;
  name: string;
  max: number; // scale maximum, used to normalise to percent
  current: number | null;
  required: number | null;
  currentLevelName: string | null;
  requiredLevelName: string | null;
}

type Req = { competencyId: string; requiredLevel: number | null };

export async function loadCompetencyPosition(
  companyId: string,
  staffRecordId: string,
): Promise<{
  items: CompetencyPosition[];
  readiness: number | null;
  hasRequirements: boolean;
  roleLabel: string | null;
}> {
  const empty = {
    items: [] as CompetencyPosition[],
    readiness: null,
    hasRequirements: false,
    roleLabel: null,
  };
  const staff = await prisma.staffRecord.findFirst({
    where: { id: staffRecordId, companyId },
    select: { designationId: true, departmentId: true, position: true },
  });
  if (!staff) return empty;

  const activeCompetency = { companyId, status: "ACTIVE" as const };
  const none: Req[] = [];
  const [roleMaps, deptMaps, ratings] = await Promise.all([
    staff.designationId
      ? prisma.competencyRoleMapping.findMany({
          where: { designationId: staff.designationId, competency: activeCompetency },
          select: { competencyId: true, requiredLevel: true },
        })
      : Promise.resolve(none),
    staff.departmentId
      ? prisma.competencyDepartmentMapping.findMany({
          where: { departmentId: staff.departmentId, competency: activeCompetency },
          select: { competencyId: true, requiredLevel: true },
        })
      : Promise.resolve(none),
    prisma.managerReviewCompetencyRating.findMany({
      where: {
        rating: { not: null },
        managerReview: {
          status: "SUBMITTED",
          participant: { staffRecordId, companyId },
        },
      },
      orderBy: { managerReview: { submittedAt: "desc" } },
      select: {
        competencyId: true,
        competencyName: true,
        rating: true,
        calibratedRating: true,
      },
    }),
  ]);

  const required = new Map<string, number>();
  for (const m of [...roleMaps, ...deptMaps])
    if (m.requiredLevel && m.requiredLevel > 0)
      required.set(
        m.competencyId,
        Math.max(required.get(m.competencyId) ?? 0, m.requiredLevel),
      );

  const latest = new Map<string, { name: string; value: number }>();
  for (const r of ratings)
    if (!latest.has(r.competencyId))
      latest.set(r.competencyId, {
        name: r.competencyName,
        value: (r.calibratedRating ?? r.rating) as number,
      });

  const ids = Array.from(new Set([...required.keys(), ...latest.keys()]));
  if (ids.length === 0) return { ...empty, roleLabel: staff.position };

  const [bounds, scales, comps] = await Promise.all([
    resolveRatingBounds(companyId, ids),
    resolveRatingScales(companyId, ids),
    prisma.competency.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, name: true },
    }),
  ]);
  const nameById = new Map(comps.map((c) => [c.id, c.name] as const));
  const levelName = (id: string, v: number | null) =>
    v === null
      ? null
      : (scales.get(id)?.levels.find((l) => l.level === Math.round(v))?.name ??
        `Level ${Math.round(v)}`);

  const items: CompetencyPosition[] = ids
    .filter((id) => nameById.has(id))
    .map((id) => ({
      competencyId: id,
      name: nameById.get(id) as string,
      max: bounds.get(id)?.max ?? 5,
      current: latest.get(id)?.value ?? null,
      required: required.get(id) ?? null,
      currentLevelName: levelName(id, latest.get(id)?.value ?? null),
      requiredLevelName: levelName(id, required.get(id) ?? null),
    }));

  const ratios = items
    .filter((i) => i.required !== null && i.current !== null)
    .map((i) => Math.min(1, (i.current as number) / (i.required as number)));
  const readiness = ratios.length
    ? Math.round((ratios.reduce((s, x) => s + x, 0) / ratios.length) * 100)
    : null;

  return {
    items,
    readiness,
    hasRequirements: required.size > 0,
    roleLabel: staff.position,
  };
}