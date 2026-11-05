import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  MANAGER_ROLES,
  PERSON_SELECT,
  assertCanAssign,
  assertCompanyAccess,
  assertOrgObjective,
  assertValidParent,
  findStaffInCompany,
  goalVisibilityWhere,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  GOAL_HISTORY_ACTIONS,
  HttpError,
  VALID_LEVELS,
  companyToday,
  enumOr,
  logGoalAction,
  parseDateOnly,
  parseIntRange,
  parseKpiFields,
  parsePositiveInt,
  parseStatusInput,
  parseText,
} from "@/app/lib/goals/goal-utils";
import {
  buildGoalHierarchy,
  calculateHeroStats,
} from "@/app/lib/team-goals/team-goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/team-goals?companyId=&departmentId=&status=&minAlignment=
export const GET = withGoalAuth(ALL_ROLES, async ({ request, user, ok }) => {
  const sp = new URL(request.url).searchParams;
  const companyId = await assertCompanyAccess(user, sp.get("companyId"));
  const actor = await resolveGoalActor(user, companyId);
  const departmentFilter = sp.get("departmentId");
  const statusFilter = sp.get("status");
  const minAlignment = parsePositiveInt(sp.get("minAlignment"), 0, 0, 100);

  const where: Prisma.GoalWhereInput = {
    companyId,
    isArchived: false,
    AND: [goalVisibilityWhere(actor)],
  };
  if (
    departmentFilter &&
    !["All", "All Departments"].includes(departmentFilter)
  )
    where.departmentId = departmentFilter;

  const [flatGoals, departments, orgObjectives] = await Promise.all([
    prisma.goal.findMany({
      where,
      include: {
        staffRecord: { select: PERSON_SELECT },
        assignedTo: { select: PERSON_SELECT },
        department: { select: { id: true, name: true } },
        kpis: {
          where: { isArchived: false },
          select: {
            id: true,
            name: true,
            targetValue: true,
            currentValue: true,
            weight: true,
          },
        },
        dependencies: {
          include: {
            dependsOnGoal: { select: { id: true, title: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.department.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.orgObjective.findMany({
      where: { companyId, isArchived: false },
      select: { id: true, title: true, level: true, departmentId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return ok({
    stats: calculateHeroStats(flatGoals, departments),
    goals: buildGoalHierarchy(flatGoals, statusFilter, minAlignment),
    orgObjectives,
    departments,
  });
});

// POST /api/team-goals  (goal, KPIs, history and feed post in ONE transaction)
export const POST = withGoalAuth(
  MANAGER_ROLES,
  async ({ request, user, ok }) => {
    const body = await request.json();
    const companyId = await assertCompanyAccess(user, body?.companyId);
    const actor = await resolveGoalActor(user, companyId);
    const actorId = requireActorId(actor);

    const title = parseText(body.title, "title", {
      max: 255,
      required: true,
    }) as string;
    const description = parseText(body.description, "description", {
      max: 5000,
    });
    const category =
      parseText(body.category, "category", { max: 100 }) ??
      "Operational Efficiency";
    const level = enumOr(body.level, VALID_LEVELS, "level", "TEAM");
    if (level === "COMPANY" && !actor.companyWide)
      throw new HttpError(
        403,
        "Only HR or admins can create company-level goals",
      );
    const weight =
      body.weight !== undefined
        ? parseIntRange(body.weight, "weight", 0, 100)
        : 0;
    const startDate =
      parseDateOnly(body.startDate, "startDate") ?? companyToday();
    const dueDate = parseDateOnly(body.dueDate, "dueDate") ?? null;
    if (dueDate && dueDate < startDate)
      throw new HttpError(400, "dueDate must be on or after startDate");

    const status =
      body.status !== undefined ? parseStatusInput(body.status) : "ON_TRACK";
    if (!["ON_TRACK", "AT_RISK", "BLOCKED"].includes(status))
      throw new HttpError(
        400,
        "A new goal can start as On Track, At Risk or Blocked",
      );

    const assignee = await findStaffInCompany(
      body.assignedToId || body.assignee || actor.staffRecordId,
      companyId,
      "Assignee",
    );
    assertCanAssign(actor, assignee);

    if (body.orgObjectiveId)
      await assertOrgObjective(String(body.orgObjectiveId), companyId);
    if (body.parentGoalId)
      await assertValidParent(null, String(body.parentGoalId), level, actor);

    const rawKpis: Record<string, unknown>[] = Array.isArray(body.kpis)
      ? body.kpis.filter((k: any) => k && (k.name || k.title)).slice(0, 20)
      : [];
    const kpis: {
      fields: Prisma.KpiUncheckedUpdateManyInput;
      ownerId: string;
    }[] = [];
    for (const k of rawKpis) {
      const fields = parseKpiFields({ ...k, name: k.name ?? k.title }, true);
      if (k.ownerId)
        await findStaffInCompany(k.ownerId, companyId, "KPI owner");
      kpis.push({ fields, ownerId: (k.ownerId as string) || assignee.id });
    }

    const goal = await prisma.$transaction(async (tx) => {
      const created = await tx.goal.create({
        data: {
          companyId,
          staffRecordId: assignee.id,
          assignedToId: assignee.id,
          assignedById: actorId,
          departmentId: assignee.departmentId,
          title,
          description,
          category,
          level,
          weight,
          orgObjectiveId: body.orgObjectiveId || null,
          parentGoalId: body.parentGoalId || null,
          startDate,
          dueDate,
          status,
          progress: 0,
          createdBy: user.userId,
        },
      });
      await logGoalAction(tx, {
        goalId: created.id,
        companyId,
        action: GOAL_HISTORY_ACTIONS.CREATED,
        actorId,
        newData: { title, level, assignedToId: assignee.id },
      });
      for (const k of kpis) {
        const kpi = await tx.kpi.create({
          data: {
            ...k.fields,
            companyId,
            goalId: created.id,
            ownerId: k.ownerId,
            createdBy: user.userId,
          } as Prisma.KpiUncheckedCreateInput,
        });
        await logGoalAction(tx, {
          goalId: created.id,
          companyId,
          action: GOAL_HISTORY_ACTIONS.KPI_ASSIGNED,
          actorId,
          newData: {
            kpiId: kpi.id,
            name: kpi.name,
            targetValue: kpi.targetValue,
          },
        });
      }
      if (level !== "INDIVIDUAL")
        await tx.goalActivity.create({
          data: {
            companyId,
            goalId: created.id,
            departmentId: assignee.departmentId,
            authorId: actorId,
            type: "ANNOUNCEMENT",
            title: "Goal Created",
            content: `New team goal created: "${title}"`,
            badgeLabel: "New Goal",
          },
        });
      return created;
    });

    return ok(goal, "Goal created successfully", 201);
  },
);
