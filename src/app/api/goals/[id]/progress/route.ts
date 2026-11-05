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
  HttpError,
  applyGoalProgress,
  parseProgress,
  parseText,
} from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/goals/:id/progress  body: { companyId, progress (0-100 integer), notes? }
export const POST = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const companyId = await assertCompanyAccess(user, body?.companyId);
    const progress = parseProgress(body.progress);
    const notes = parseText(body.notes, "notes", { max: 2000 });
    const actor = await resolveGoalActor(user, companyId);
    const actorId = requireActorId(actor);
    const { goal, access } = await loadGoal(params.id, actor, "write");
    if (goal.isArchived)
      throw new HttpError(409, "Cannot update progress on an archived goal");

    const result = await prisma.$transaction(async (tx) => {
      const res = await applyGoalProgress(tx, {
        goal,
        progress,
        notes,
        actorId,
        updatedBy: user.userId,
        source: access.isOwner || access.isAssignee ? "SELF" : "MANAGER",
      });
      try {
        const { emitAutomationEvent } = require("@/app/lib/automation-events");
        await emitAutomationEvent(tx, {
          companyId,
          trigger: "GOAL_UPDATED",
          eventKey: `GOAL_UPDATED:${res.goal.id}:${res.progressUpdate.id}`,
          entityType: "GOAL",
          entityId: res.goal.id,
          subjectStaffRecordId: res.goal.staffRecordId,
          payload: { goalId: res.goal.id, progress: res.goal.progress },
        });
      } catch {}
      return res;
    });

    try {
      const { kickAutomation } = require("@/app/lib/automation-events");
      kickAutomation(companyId);
    } catch {}

    return ok(result, "Progress updated successfully");
  },
);
