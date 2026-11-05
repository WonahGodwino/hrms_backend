import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  MANAGER_ROLES,
  goalAccess,
  GOAL_ACCESS_INCLUDE,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  ConflictError,
  GOAL_HISTORY_ACTIONS,
  HttpError,
  logGoalAction,
  parseText,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/team-goals/conflicts/:id/resolve  body: { resolutionId?, note? }
// Records the decision. Applying the chosen change (deadline, assignee) is not wired yet.
export const POST = withGoalAuth<{ id: string }>(
  MANAGER_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const conflict = await prisma.goalConflict.findUnique({
      where: { id: params.id },
      include: {
        resolutions: { select: { id: true } },
        goalA: { include: GOAL_ACCESS_INCLUDE },
        goalB: { include: GOAL_ACCESS_INCLUDE },
      },
    });
    if (!conflict || !(await verifyCompanyAccess(user, conflict.companyId)))
      throw new HttpError(404, "Conflict not found");

    const actor = await resolveGoalActor(user, conflict.companyId);
    const actorId = requireActorId(actor);
    if (
      !goalAccess(actor, conflict.goalA).canWrite &&
      !goalAccess(actor, conflict.goalB).canWrite
    )
      throw new HttpError(
        403,
        "You do not have permission to resolve this conflict",
      );

    const resolutionId =
      typeof body.resolutionId === "string" ? body.resolutionId : null;
    if (
      resolutionId &&
      !conflict.resolutions.some((r) => r.id === resolutionId)
    )
      throw new HttpError(400, "resolutionId does not belong to this conflict");
    const note = parseText(body.note, "note", { max: 1000 });

    const updated = await prisma.$transaction(async (tx) => {
      const cas = await tx.goalConflict.updateMany({
        where: { id: conflict.id, status: "OPEN" },
        data: {
          status: "RESOLVED",
          resolvedById: actorId,
          resolvedAt: new Date(),
          resolutionNote: note,
        },
      });
      if (cas.count !== 1)
        throw new ConflictError("This conflict has already been resolved");
      if (resolutionId) {
        await tx.goalConflictResolution.updateMany({
          where: { conflictId: conflict.id },
          data: { isChosen: false },
        });
        await tx.goalConflictResolution.update({
          where: { id: resolutionId },
          data: { isChosen: true },
        });
      }
      for (const goalId of [conflict.goalAId, conflict.goalBId])
        await logGoalAction(tx, {
          goalId,
          companyId: conflict.companyId,
          action: GOAL_HISTORY_ACTIONS.CONFLICT_RESOLVED,
          actorId,
          newData: { conflictId: conflict.id, resolutionId },
        });
      return tx.goalConflict.findUniqueOrThrow({ where: { id: conflict.id } });
    });
    return ok(updated);
  },
);
