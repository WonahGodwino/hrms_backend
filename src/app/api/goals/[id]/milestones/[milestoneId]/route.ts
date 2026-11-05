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
  VALID_MILESTONE_STATUSES,
  logGoalAction,
  parseEnum,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type P = { id: string; milestoneId: string };

async function loadMilestone(
  goalId: string,
  milestoneId: string,
  companyId: string,
  user: Parameters<typeof resolveGoalActor>[0],
) {
  const actor = await resolveGoalActor(user, companyId);
  const actorId = requireActorId(actor);
  const { goal } = await loadGoal(goalId, actor, "write");
  if (goal.isArchived)
    throw new HttpError(409, "Cannot change milestones on an archived goal");
  const milestone = await prisma.goalMilestone.findFirst({
    where: { id: milestoneId, goalId },
  });
  if (!milestone) throw new HttpError(404, "Milestone not found");
  return { actorId, goal, milestone };
}

// PATCH /api/goals/:id/milestones/:milestoneId  body: { companyId, status }
export const PATCH = withGoalAuth<P>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const companyId = await assertCompanyAccess(user, body?.companyId);
    const status = parseEnum(body.status, VALID_MILESTONE_STATUSES, "status");
    const { actorId, goal, milestone } = await loadMilestone(
      params.id,
      params.milestoneId,
      companyId,
      user,
    );
    if (milestone.status === status) return ok(milestone, "No change");

    const updated = await prisma.$transaction(async (tx) => {
      const cas = await tx.goalMilestone.updateMany({
        where: { id: milestone.id, status: milestone.status },
        data: {
          status,
          completedAt: status === "COMPLETED" ? new Date() : null,
        },
      });
      if (cas.count !== 1) throw new ConflictError();
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId,
        action: GOAL_HISTORY_ACTIONS.MILESTONE_STATUS_CHANGED,
        actorId,
        previousData: { milestoneId: milestone.id, status: milestone.status },
        newData: { milestoneId: milestone.id, title: milestone.title, status },
      });
      return tx.goalMilestone.findUniqueOrThrow({
        where: { id: milestone.id },
      });
    });
    return ok(updated, "Milestone updated successfully");
  },
);

// DELETE /api/goals/:id/milestones/:milestoneId?companyId=...
// Hard delete, but a snapshot is written to the history first.
export const DELETE = withGoalAuth<P>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const companyId = await assertCompanyAccess(
      user,
      new URL(request.url).searchParams.get("companyId"),
    );
    const { actorId, goal, milestone } = await loadMilestone(
      params.id,
      params.milestoneId,
      companyId,
      user,
    );
    await prisma.$transaction(async (tx) => {
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId,
        action: GOAL_HISTORY_ACTIONS.MILESTONE_REMOVED,
        actorId,
        previousData: {
          milestoneId: milestone.id,
          title: milestone.title,
          status: milestone.status,
          dueDate: milestone.dueDate,
          completedAt: milestone.completedAt,
        },
      });
      await tx.goalMilestone.delete({ where: { id: milestone.id } });
    });
    return ok(null, "Milestone removed successfully");
  },
);
