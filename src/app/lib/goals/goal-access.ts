import { NextRequest } from "next/server";
import { GoalLevel, Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  resolveActorStaffId,
  UserContext,
} from "@/app/lib/access-control";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { HttpError, LEVEL_RANK } from "./goal-utils";

export const ALL_ROLES = ["STAFF", "MANAGER", "HR", "ADMIN", "SUPER_ADMIN"];
export const MANAGER_ROLES = ["MANAGER", "HR", "ADMIN", "SUPER_ADMIN"];
export const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
} as const;

// ---------------------------------------------------------------------------
// Route wrapper: auth header, requireRole, params, HttpError, CORS, errors
// ---------------------------------------------------------------------------
export type GoalCtx<P> = {
  request: NextRequest;
  user: UserContext;
  params: P;
  origin: string | null;
  ok: (data: unknown, message?: string, status?: number) => Promise<Response>;
};

export function withGoalAuth<P = Record<string, string>>(
  roles: string[],
  handler: (ctx: GoalCtx<P>) => Promise<Response>,
) {
  return async (
    request: NextRequest,
    context?: RouteContext<P>,
  ): Promise<Response> => {
    const origin = request.headers.get("origin");
    try {
      const authHeader = request.headers.get("authorization");
      if (!authHeader)
        return withCors(
          ApiResponse.error("Authorization header missing", 401),
          origin,
        );
      const user: UserContext = requireRole(
        authHeader.replace("Bearer ", ""),
        roles,
      );
      const params = (context ? await context.params : {}) as P;
      const ok = (data: unknown, message?: string, status?: number) =>
        withCors(ApiResponse.success(data, message, status), origin);
      return await handler({ request, user, params, origin, ok });
    } catch (error) {
      if (error instanceof HttpError)
        return withCors(ApiResponse.error(error.message, error.status), origin);
      return withCors(handleApiError(error), origin);
    }
  };
}

export async function assertCompanyAccess(
  user: UserContext,
  companyId: unknown,
): Promise<string> {
  if (typeof companyId !== "string" || !companyId)
    throw new HttpError(400, "Missing required field: companyId");
  if (!(await verifyCompanyAccess(user, companyId)))
    throw new HttpError(403, "Forbidden: No access to this company");
  return companyId;
}

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------
export type GoalActor = {
  user: UserContext;
  companyId: string;
  role: string;
  companyWide: boolean;
  staffRecordId: string | null; // staff record inside THIS company
  actorId: string | null; // staff record used for history/author columns
  departmentId: string | null;
};

export async function resolveGoalActor(
  user: UserContext,
  companyId: string,
): Promise<GoalActor> {
  const role = (user.role ?? "").toUpperCase();
  const companyWide = ["HR", "ADMIN", "SUPER_ADMIN"].includes(role);
  const staffRecordId = await resolveActorStaffId(user, companyId);
  let departmentId: string | null = null;
  if (staffRecordId) {
    const s = await prisma.staffRecord.findUnique({
      where: { id: staffRecordId },
      select: { departmentId: true },
    });
    departmentId = s?.departmentId ?? null;
  }
  let actorId = staffRecordId;
  if (!actorId && companyWide) {
    // admins working in a company where they have no record: use their own record
    const home = await prisma.staffRecord.findUnique({
      where: { id: user.userId },
      select: { id: true },
    });
    actorId = home?.id ?? null;
  }
  return {
    user,
    companyId,
    role,
    companyWide,
    staffRecordId,
    actorId,
    departmentId,
  };
}

export function requireActorId(actor: GoalActor): string {
  if (!actor.actorId)
    throw new HttpError(
      403,
      "A staff record is required to perform this action",
    );
  return actor.actorId;
}

// ---------------------------------------------------------------------------
// Access rules. goalAccess (one goal) and goalVisibilityWhere (lists) must
// stay in step: change both together.
// ---------------------------------------------------------------------------
export const GOAL_ACCESS_INCLUDE = {
  staffRecord: { select: { managerId: true } },
  assignedTo: { select: { managerId: true } },
  department: { select: { headId: true } },
} satisfies Prisma.GoalInclude;

export type LoadedGoal = Prisma.GoalGetPayload<{
  include: typeof GOAL_ACCESS_INCLUDE;
}>;

export type AccessInput = {
  staffRecordId: string;
  assignedToId: string | null;
  departmentId: string | null;
  level: GoalLevel;
  staffRecord?: { managerId: string | null } | null;
  assignedTo?: { managerId: string | null } | null;
  department?: { headId: string | null } | null;
};

export type GoalAccess = {
  canView: boolean;
  canWrite: boolean;
  canManage: boolean; // direct manager or company-wide: may set impact, KPIs, assignment
  isOwner: boolean;
  isAssignee: boolean;
  isManager: boolean;
  isDeptHead: boolean;
};

export function goalAccess(actor: GoalActor, g: AccessInput): GoalAccess {
  const me = actor.staffRecordId;
  const isOwner = !!me && g.staffRecordId === me;
  const isAssignee = !!me && g.assignedToId === me;
  const isManager =
    !!me && (g.staffRecord?.managerId === me || g.assignedTo?.managerId === me);
  const isDeptHead = !!me && g.department?.headId === me;
  const canManage = actor.companyWide || isManager;
  const canWrite = canManage || isOwner || isAssignee;
  let canView = canWrite || isDeptHead;
  if (!canView && me) {
    if (g.level === "COMPANY") canView = true;
    else if (
      (g.level === "DEPARTMENT" || g.level === "TEAM") &&
      actor.departmentId &&
      g.departmentId === actor.departmentId
    )
      canView = true;
  }
  return {
    canView,
    canWrite,
    canManage,
    isOwner,
    isAssignee,
    isManager,
    isDeptHead,
  };
}

export function goalVisibilityWhere(actor: GoalActor): Prisma.GoalWhereInput {
  if (actor.companyWide) return {};
  const me = actor.staffRecordId;
  if (!me) return { id: { in: [] } }; // fail closed
  const or: Prisma.GoalWhereInput[] = [
    { staffRecordId: me },
    { assignedToId: me },
    { staffRecord: { managerId: me } },
    { assignedTo: { managerId: me } },
    { department: { headId: me } },
    { level: "COMPANY" },
  ];
  if (actor.departmentId)
    or.push({
      departmentId: actor.departmentId,
      level: { in: ["DEPARTMENT", "TEAM"] },
    });
  return { OR: or };
}

// 404 when the goal is missing, in another company or not visible to the actor
export async function loadGoal(
  goalId: string,
  actor: GoalActor,
  need: "view" | "write",
  label = "Goal",
) {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, companyId: actor.companyId },
    include: GOAL_ACCESS_INCLUDE,
  });
  const access = goal ? goalAccess(actor, goal) : null;
  if (!goal || !access?.canView) throw new HttpError(404, `${label} not found`);
  if (need === "write" && !access.canWrite)
    throw new HttpError(403, "You do not have permission to change this goal");
  return { goal, access };
}

// ---------------------------------------------------------------------------
// Same-company lookups for ids that arrive in a request body
// ---------------------------------------------------------------------------
export async function findStaffInCompany(
  id: unknown,
  companyId: string,
  label = "Staff member",
) {
  if (typeof id !== "string" || !id)
    throw new HttpError(400, `${label} is required`);
  const staff = await prisma.staffRecord.findFirst({
    where: { id, companyId, isActive: true },
    select: { id: true, departmentId: true, managerId: true },
  });
  if (!staff)
    throw new HttpError(
      400,
      `${label} does not belong to this company or is inactive`,
    );
  return staff;
}

export function assertCanAssign(
  actor: GoalActor,
  staff: { id: string; departmentId: string | null; managerId: string | null },
) {
  if (actor.companyWide) return;
  const me = actor.staffRecordId;
  if (
    me &&
    (staff.id === me ||
      staff.managerId === me ||
      (actor.departmentId && staff.departmentId === actor.departmentId))
  )
    return;
  throw new HttpError(
    403,
    "You can only assign goals to yourself, your direct reports or your department",
  );
}

export async function assertValidParent(
  goalId: string | null,
  parentId: string,
  childLevel: GoalLevel,
  actor: GoalActor,
) {
  if (goalId && parentId === goalId)
    throw new HttpError(400, "A goal cannot be its own parent");
  const { goal: parent } = await loadGoal(
    parentId,
    actor,
    "view",
    "Parent goal",
  );
  if (parent.isArchived) throw new HttpError(400, "Parent goal is archived");
  if (LEVEL_RANK[parent.level] > LEVEL_RANK[childLevel])
    throw new HttpError(
      400,
      "A parent goal cannot be a lower level than its child",
    );
  if (goalId) {
    let cursor: string | null = parent.parentGoalId;
    for (let i = 0; cursor && i < 50; i++) {
      if (cursor === goalId)
        throw new HttpError(
          400,
          "This parent would create a loop in the goal hierarchy",
        );
      const up: { parentGoalId: string | null } | null =
        await prisma.goal.findUnique({
          where: { id: cursor },
          select: { parentGoalId: true },
        });
      cursor = up?.parentGoalId ?? null;
    }
  }
  return parent;
}

export async function assertOrgObjective(id: string, companyId: string) {
  const o = await prisma.orgObjective.findFirst({
    where: { id, companyId, isArchived: false },
    select: { id: true },
  });
  if (!o) throw new HttpError(400, "Objective does not belong to this company");
}
