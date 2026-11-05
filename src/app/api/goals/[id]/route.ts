import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  assertCompanyAccess,
  loadGoal,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  ConflictError,
  GOAL_HISTORY_ACTIONS,
  HttpError,
  VALID_ALIGNMENT_TYPES,
  VALID_KPI_IMPACTS,
  VALID_PERFORMANCE_CATEGORIES,
  VALID_PRIORITIES,
  createEditTracker,
  daysUntil,
  isOverdue,
  logGoalAction,
  optEnum,
  parseDateOnly,
  parseEnum,
  parseText,
  stripPrioritySuffix,
} from "@/app/lib/goals/goal-utils";
import type { Prisma } from "@prisma/client";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/goals/:id?companyId=...  (archived goals are readable: archive drawer)
export const GET = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const companyId = await assertCompanyAccess(
      user,
      new URL(request.url).searchParams.get("companyId"),
    );
    const actor = await resolveGoalActor(user, companyId);
    const { access } = await loadGoal(params.id, actor, "view");

    const goal = await prisma.goal.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        milestones: { orderBy: { displayOrder: "asc" } },
        evidence: {
          orderBy: { createdAt: "desc" },
          include: {
            uploader: { select: { firstName: true, lastName: true } },
          },
        },
        comments: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { firstName: true, lastName: true } } },
        },
        department: { select: { id: true, name: true } },
      },
    });

    return ok(
      {
        ...goal,
        // files are served through an authenticated route, never by raw path
        evidence: goal.evidence.map(
          ({ fileUrl: _omit, data: _omitData, ...e }) => ({
            ...e,
            downloadPath: `/api/goals/evidence/${e.id}/file`,
          }),
        ),
        milestonesCompleted: goal.milestones.filter(
          (m) => m.status === "COMPLETED",
        ).length,
        milestonesTotal: goal.milestones.length,
        remainingDays: daysUntil(goal.dueDate),
        isOverdue: isOverdue(goal.dueDate) && goal.status !== "COMPLETED",
        permissions: {
          canEdit: access.canWrite,
          canUpdateProgress: access.canWrite,
          canArchive: access.canWrite,
          canEditImpact: access.canManage,
        },
      },
      "Goal retrieved successfully",
    );
  },
);

// PATCH /api/goals/:id  body: { companyId, title?, description?, category?,
//   performanceCategory?, priority?, alignmentType?, startDate?, dueDate?, kpiImpact? }
// Owner, assignee, direct manager and HR/admin. kpiImpact: manager/HR only,
// because it weights the goal in the appraisal score.
export const PATCH = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const companyId = await assertCompanyAccess(user, body?.companyId);
    const actor = await resolveGoalActor(user, companyId);
    const actorId = requireActorId(actor);
    const { goal, access } = await loadGoal(params.id, actor, "write");
    if (goal.isArchived)
      throw new HttpError(
        409,
        "Archived goals cannot be edited. Restore the goal first",
      );

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
    if (body.performanceCategory !== undefined)
      t.edit(
        "performanceCategory",
        optEnum(
          body.performanceCategory,
          VALID_PERFORMANCE_CATEGORIES,
          "performanceCategory",
        ),
      );
    if (body.priority !== undefined)
      t.edit(
        "priority",
        parseEnum(
          body.priority,
          VALID_PRIORITIES,
          "priority",
          stripPrioritySuffix,
        ),
      );
    if (body.alignmentType !== undefined)
      t.edit(
        "alignmentType",
        parseEnum(body.alignmentType, VALID_ALIGNMENT_TYPES, "alignmentType"),
      );

    const startDate =
      body.startDate !== undefined
        ? parseDateOnly(body.startDate, "startDate")
        : undefined;
    const dueDate =
      body.dueDate !== undefined
        ? parseDateOnly(body.dueDate, "dueDate")
        : undefined;
    if (startDate === null)
      throw new HttpError(400, "startDate cannot be cleared");
    if (startDate !== undefined) t.edit("startDate", startDate);
    if (dueDate !== undefined) t.edit("dueDate", dueDate);
    const effStart = startDate ?? goal.startDate;
    const effDue = dueDate !== undefined ? dueDate : goal.dueDate;
    if (effStart && effDue && effDue < effStart)
      throw new HttpError(400, "dueDate must be on or after startDate");

    if (body.kpiImpact !== undefined) {
      if (!access.canManage)
        throw new HttpError(
          403,
          "Only a manager or HR can change the KPI impact",
        );
      t.edit(
        "kpiImpact",
        parseEnum(body.kpiImpact, VALID_KPI_IMPACTS, "kpiImpact"),
      );
    }

    if (!t.changed) return ok({ id: goal.id }, "No changes");

    const updated = await prisma.$transaction(async (tx) => {
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
      if ("kpiImpact" in t.data)
        await logGoalAction(tx, {
          goalId: goal.id,
          companyId,
          action: GOAL_HISTORY_ACTIONS.IMPACT_CHANGED,
          actorId,
          previousData: { kpiImpact: goal.kpiImpact },
          newData: { kpiImpact: t.data.kpiImpact },
        });
      const freshGoal = await tx.goal.findUniqueOrThrow({
        where: { id: goal.id },
        include: { milestones: { orderBy: { displayOrder: "asc" } } },
      });
      try {
        const { emitAutomationEvent } = require("@/app/lib/automation-events");
        await emitAutomationEvent(tx, {
          companyId,
          trigger: "GOAL_UPDATED",
          eventKey: `GOAL_UPDATED:${freshGoal.id}:${freshGoal.updatedAt.getTime()}`,
          entityType: "GOAL",
          entityId: freshGoal.id,
          subjectStaffRecordId: freshGoal.staffRecordId,
          payload: { goalId: freshGoal.id, progress: freshGoal.progress },
        });
      } catch {}
      return freshGoal;
    });

    try {
      const { kickAutomation } = require("@/app/lib/automation-events");
      kickAutomation(companyId);
    } catch {}

    return ok(updated, "Goal updated successfully");
  },
);
