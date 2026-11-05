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
  GOAL_HISTORY_ACTIONS,
  HttpError,
  logGoalAction,
  parseDateOnly,
  parseIntRange,
  parseText,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/goals/:id/milestones  body: { companyId, title, dueDate?, displayOrder? }
export const POST = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const companyId = await assertCompanyAccess(user, body?.companyId);
    const title = parseText(body.title, "title", {
      max: 255,
      required: true,
    }) as string;
    const dueDate = parseDateOnly(body.dueDate, "dueDate") ?? null;
    const order =
      body.displayOrder !== undefined && body.displayOrder !== null
        ? parseIntRange(body.displayOrder, "displayOrder", 0, 10_000)
        : null;
    const actor = await resolveGoalActor(user, companyId);
    const actorId = requireActorId(actor);
    const { goal } = await loadGoal(params.id, actor, "write");
    if (goal.isArchived)
      throw new HttpError(409, "Cannot add milestones to an archived goal");

    const milestone = await prisma.$transaction(async (tx) => {
      const last = await tx.goalMilestone.findFirst({
        where: { goalId: goal.id },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      });
      const created = await tx.goalMilestone.create({
        data: {
          goalId: goal.id,
          title,
          dueDate,
          displayOrder: order ?? (last?.displayOrder ?? -1) + 1,
        },
      });
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId,
        action: GOAL_HISTORY_ACTIONS.MILESTONE_ADDED,
        actorId,
        newData: { title: created.title },
      });
      return created;
    });
    return ok(milestone, "Milestone added successfully", 201);
  },
);
