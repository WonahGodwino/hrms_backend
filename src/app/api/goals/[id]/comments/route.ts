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
  logGoalAction,
  parseEnum,
  parseText,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/goals/:id/comments  body: { companyId, message, type? }
// Anyone who can view the goal may comment. MANAGER_ACKNOWLEDGEMENT is decided
// by the server (direct manager, department head or HR), never by the client.
export const POST = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const companyId = await assertCompanyAccess(user, body?.companyId);
    const message = parseText(body.message, "message", {
      max: 2000,
      required: true,
    }) as string;
    const requested =
      body.type !== undefined && body.type !== null && body.type !== ""
        ? parseEnum(
            body.type,
            ["MANAGER_ACKNOWLEDGEMENT", "GENERAL"] as const,
            "type",
          )
        : null;
    const actor = await resolveGoalActor(user, companyId);
    const actorId = requireActorId(actor);
    const { goal, access } = await loadGoal(params.id, actor, "view");

    const eligible =
      access.isManager || access.isDeptHead || actor.role === "HR";
    const type =
      requested === "GENERAL"
        ? "GENERAL"
        : eligible
          ? "MANAGER_ACKNOWLEDGEMENT"
          : "GENERAL";

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.goalComment.create({
        data: { goalId: goal.id, authorId: actorId, type, message },
        include: { author: { select: { firstName: true, lastName: true } } },
      });
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId,
        action: GOAL_HISTORY_ACTIONS.COMMENT_ADDED,
        actorId,
        newData: { type },
      });
      return created;
    });
    return ok(comment, "Comment added successfully", 201);
  },
);
