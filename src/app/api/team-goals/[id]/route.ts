import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  MANAGER_ROLES,
  PERSON_SELECT,
  assertCanAssign,
  assertOrgObjective,
  assertValidParent,
  findStaffInCompany,
  loadGoal,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  ConflictError,
  GOAL_HISTORY_ACTIONS,
  HttpError,
  VALID_LEVELS,
  applyGoalProgress,
  createEditTracker,
  daysUntil,
  logGoalAction,
  parseDateOnly,
  parseEnum,
  parseIntRange,
  parseProgress,
  parseStatusInput,
  parseText,
} from "@/app/lib/goals/goal-utils";
import {
  calculateGoalAlignment,
  mapStatusToUi,
} from "@/app/lib/team-goals/team-goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// The company always comes from the goal itself, never from the request.
async function actorForGoal(
  user: Parameters<typeof resolveGoalActor>[0],
  goalId: string,
) {
  const base = await prisma.goal.findUnique({
    where: { id: goalId },
    select: { companyId: true },
  });
  if (!base || !(await verifyCompanyAccess(user, base.companyId)))
    throw new HttpError(404, "Goal not found");
  return resolveGoalActor(user, base.companyId);
}

const kpiPercent = (k: { targetValue: number; currentValue: number }) =>
  k.targetValue > 0
    ? Math.max(
        0,
        Math.min(100, Math.round((k.currentValue / k.targetValue) * 100)),
      )
    : 0;

// GET /api/team-goals/:id
export const GET = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ user, params, ok }) => {
    const actor = await actorForGoal(user, params.id);
    const { goal: base, access } = await loadGoal(params.id, actor, "view");
    if (base.isArchived) throw new HttpError(404, "Goal not found");

    const goal = await prisma.goal.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        staffRecord: { select: PERSON_SELECT },
        assignedTo: { select: PERSON_SELECT },
        department: { select: { id: true, name: true } },
        orgObjective: { select: { id: true, title: true, level: true } },
        kpis: {
          where: { isArchived: false },
          include: { owner: { select: PERSON_SELECT } },
        },
        dependencies: {
          include: {
            dependsOnGoal: { select: { id: true, title: true, status: true } },
          },
        },
        aiAnalyses: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
    });

    const levelStr = (goal.level || "TEAM").toUpperCase();
    const typeLabel =
      levelStr === "COMPANY"
        ? "Company Objective"
        : levelStr === "DEPARTMENT"
          ? "Department Objective"
          : levelStr === "INDIVIDUAL"
            ? "Individual Goal"
            : "Team Goal";

    const alignmentScore = calculateGoalAlignment(goal);
    const alignmentNote = goal.orgObjective?.title
      ? `Aligned to: ${goal.orgObjective.title}`
      : goal.parentGoalId
        ? "Aligned to parent strategic initiative"
        : "Standard operational alignment";

    const kpis = goal.kpis.map((k) => ({
      id: k.id,
      name: k.name,
      title: k.name,
      description: k.description,
      unit: k.unit,
      impact: k.impact,
      targetValue: k.targetValue,
      currentValue: k.currentValue,
      progress: kpiPercent(k),
      weight: k.weight,
      ownerId: k.ownerId,
      owner: k.owner
        ? `${k.owner.firstName} ${k.owner.lastName}`.trim()
        : "Unassigned",
      ownerAvatar: k.owner?.avatarUrl || undefined,
      deadline: k.deadline
        ? k.deadline.toLocaleDateString("en-US", { timeZone: "UTC" })
        : null,
      measurementMethod: k.measurementMethod,
      automatedTracking: k.automatedTracking,
      integrationSource: k.integrationSource,
    }));

    const dependencies = [
      ...goal.dependencies.map((d) => ({
        id: d.dependsOnGoal.id,
        title: d.dependsOnGoal.title,
        isCurrent: false,
        isBlocking: d.isBlocking,
        status: d.dependsOnGoal.status,
      })),
      { id: goal.id, title: goal.title, isCurrent: true, status: goal.status },
    ];

    const active = goal.assignedTo || goal.staffRecord;
    return ok({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      type: typeLabel,
      level: goal.level,
      status: mapStatusToUi(goal.status, goal.dueDate),
      storedStatus: goal.status,
      progress: goal.progress ?? 0,
      alignmentScore,
      alignmentNote,
      deadline: goal.dueDate
        ? goal.dueDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })
        : "Not set",
      dueDate: goal.dueDate,
      daysLeft: daysUntil(goal.dueDate),
      category: goal.category,
      orgObjectiveId: goal.orgObjectiveId,
      assignedToId: goal.assignedToId || goal.staffRecordId,
      owner: active
        ? `${active.firstName} ${active.lastName}`.trim()
        : "Unassigned",
      ownerAvatar: active?.avatarUrl || undefined,
      departmentName: goal.department?.name,
      aiAnalysis: goal.aiAnalyses[0]?.summary ?? "",
      kpis,
      dependencies,
      permissions: {
        canEdit: access.canWrite,
        canManage: access.canManage,
        canManageKpis: access.canManage,
      },
    });
  },
);

// PATCH /api/team-goals/:id  (title, description, category, dueDate, level, weight,
//   orgObjectiveId, parentGoalId, assignedToId, status, progress)
export const PATCH = withGoalAuth<{ id: string }>(
  MANAGER_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const actor = await actorForGoal(user, params.id);
    const actorId = requireActorId(actor);
    const { goal } = await loadGoal(params.id, actor, "write");
    if (goal.isArchived)
      throw new HttpError(
        409,
        "Archived goals cannot be edited. Restore the goal first",
      );
    const companyId = goal.companyId;

    const t = createEditTracker(goal);
    if (body.title !== undefined)
      t.edit(
        "title",
        parseText(body.title, "title", { max: 255, required: true }),
      );
    if (body.description !== undefined)
      t.edit(
        "description",
        parseText(body.description, "description", { max: 5000 }),
      );
    if (body.category !== undefined)
      t.edit("category", parseText(body.category, "category", { max: 100 }));
    if (body.weight !== undefined)
      t.edit("weight", parseIntRange(body.weight, "weight", 0, 100));

    const dueDate =
      body.dueDate !== undefined
        ? parseDateOnly(body.dueDate, "dueDate")
        : undefined;
    if (dueDate !== undefined) {
      if (dueDate && goal.startDate && dueDate < goal.startDate)
        throw new HttpError(400, "dueDate must be on or after startDate");
      t.edit("dueDate", dueDate);
    }

    let level = goal.level;
    if (body.level !== undefined) {
      level = parseEnum(body.level, VALID_LEVELS, "level");
      if (level === "COMPANY" && !actor.companyWide)
        throw new HttpError(
          403,
          "Only HR or admins can make a goal company-level",
        );
      t.edit("level", level);
    }

    if (body.orgObjectiveId !== undefined) {
      if (body.orgObjectiveId)
        await assertOrgObjective(String(body.orgObjectiveId), companyId);
      t.edit("orgObjectiveId", body.orgObjectiveId || null);
    }
    if (body.parentGoalId !== undefined) {
      if (body.parentGoalId)
        await assertValidParent(
          goal.id,
          String(body.parentGoalId),
          level,
          actor,
        );
      t.edit("parentGoalId", body.parentGoalId || null);
    }
    if (body.assignedToId !== undefined) {
      const staff = await findStaffInCompany(
        body.assignedToId,
        companyId,
        "Assignee",
      );
      assertCanAssign(actor, staff);
      // owner follows the assignee: appraisals count goals by owner
      t.edit("assignedToId", staff.id);
      t.edit("staffRecordId", staff.id);
      t.edit("departmentId", staff.departmentId);
      t.edit("assignedById", actorId);
    }

    const progress =
      body.progress !== undefined ? parseProgress(body.progress) : undefined;
    let manualStatus =
      body.status !== undefined ? parseStatusInput(body.status) : undefined;
    if (manualStatus && manualStatus === goal.status && progress === undefined)
      manualStatus = undefined;
    if (
      manualStatus &&
      manualStatus !== "COMPLETED" &&
      goal.status === "COMPLETED" &&
      progress === undefined
    )
      throw new HttpError(
        400,
        "To reopen a completed goal, lower its progress below 100%",
      );
    const targetProgress =
      progress ?? (manualStatus === "COMPLETED" ? 100 : undefined);

    if (!t.changed && targetProgress === undefined && !manualStatus)
      return ok({ id: goal.id }, "No changes");

    const updated = await prisma.$transaction(async (tx) => {
      if (t.changed) {
        const cas = await tx.goal.updateMany({
          where: { id: goal.id, updatedAt: goal.updatedAt, isArchived: false },
          data: {
            ...t.data,
            updatedBy: user.userId,
          } as Prisma.GoalUncheckedUpdateManyInput,
        });
        if (cas.count !== 1) throw new ConflictError();
        await logGoalAction(tx, {
          goalId: goal.id,
          companyId,
          action: GOAL_HISTORY_ACTIONS.EDITED,
          actorId,
          previousData: t.prev,
          newData: t.next,
        });
        if ("assignedToId" in t.data)
          await logGoalAction(tx, {
            goalId: goal.id,
            companyId,
            action: GOAL_HISTORY_ACTIONS.REASSIGNED,
            actorId,
            previousData: {
              assignedToId: goal.assignedToId ?? goal.staffRecordId,
            },
            newData: { assignedToId: t.data.assignedToId },
          });
        if ("parentGoalId" in t.data)
          await logGoalAction(tx, {
            goalId: goal.id,
            companyId,
            action: GOAL_HISTORY_ACTIONS.REPARENTED,
            actorId,
            previousData: { parentGoalId: goal.parentGoalId },
            newData: { parentGoalId: t.data.parentGoalId ?? null },
          });
      }

      if (targetProgress !== undefined) {
        const current = await tx.goal.findUniqueOrThrow({
          where: { id: goal.id },
          select: {
            id: true,
            companyId: true,
            progress: true,
            status: true,
            startDate: true,
            dueDate: true,
          },
        });
        await applyGoalProgress(tx, {
          goal: current,
          progress: targetProgress,
          notes: null,
          actorId,
          updatedBy: user.userId,
          source: "MANAGER",
          keepBlocked: manualStatus === "BLOCKED",
        });
        if (goal.level !== "INDIVIDUAL")
          await tx.goalActivity.create({
            data: {
              companyId,
              goalId: goal.id,
              departmentId: goal.departmentId,
              authorId: actorId,
              type: "UPDATE",
              title: "Progress Updated",
              content: `Progress updated to ${targetProgress}% on "${goal.title}"`,
              badgeLabel: `${targetProgress}% Done`,
            },
          });
      } else if (manualStatus) {
        const cas = await tx.goal.updateMany({
          where: { id: goal.id, status: goal.status },
          data: { status: manualStatus, updatedBy: user.userId },
        });
        if (cas.count !== 1) throw new ConflictError();
        await logGoalAction(tx, {
          goalId: goal.id,
          companyId,
          action: GOAL_HISTORY_ACTIONS.STATUS_CHANGED,
          actorId,
          previousData: { status: goal.status },
          newData: { status: manualStatus },
        });
      }
      return tx.goal.findUniqueOrThrow({ where: { id: goal.id } });
    });
    return ok(updated, "Goal updated successfully");
  },
);

// DELETE /api/team-goals/:id  (soft archive)
export const DELETE = withGoalAuth<{ id: string }>(
  MANAGER_ROLES,
  async ({ user, params, ok }) => {
    const actor = await actorForGoal(user, params.id);
    const actorId = requireActorId(actor);
    const { goal } = await loadGoal(params.id, actor, "write");
    if (goal.isArchived) throw new HttpError(409, "Goal is already archived");
    await prisma.$transaction(async (tx) => {
      const cas = await tx.goal.updateMany({
        where: { id: goal.id, isArchived: false },
        data: { isArchived: true, updatedBy: user.userId },
      });
      if (cas.count !== 1) throw new ConflictError();
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId: goal.companyId,
        action: GOAL_HISTORY_ACTIONS.ARCHIVED,
        actorId,
        previousData: { isArchived: false },
        newData: { isArchived: true },
      });
    });
    return ok({ archived: true });
  },
);
