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
  logGoalAction,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/goals/:id/archive-toggle  body: { companyId, isArchived }
export const POST = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const companyId = await assertCompanyAccess(user, body?.companyId);
    if (typeof body.isArchived !== "boolean")
      throw new HttpError(400, "isArchived (boolean) is required");
    const actor = await resolveGoalActor(user, companyId);
    const actorId = requireActorId(actor);
    const { goal } = await loadGoal(params.id, actor, "write");
    if (goal.isArchived === body.isArchived)
      throw new HttpError(
        400,
        `Goal is already ${body.isArchived ? "archived" : "active"}`,
      );

    const updated = await prisma.$transaction(async (tx) => {
      const cas = await tx.goal.updateMany({
        where: { id: goal.id, isArchived: goal.isArchived },
        data: { isArchived: body.isArchived, updatedBy: user.userId },
      });
      if (cas.count !== 1) throw new ConflictError();
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId,
        action: body.isArchived
          ? GOAL_HISTORY_ACTIONS.ARCHIVED
          : GOAL_HISTORY_ACTIONS.UNARCHIVED,
        actorId,
        previousData: { isArchived: goal.isArchived },
        newData: { isArchived: body.isArchived },
      });
      return tx.goal.findUniqueOrThrow({ where: { id: goal.id } });
    });
    return ok(
      updated,
      `Goal ${body.isArchived ? "archived" : "restored"} successfully`,
    );
  },
);
