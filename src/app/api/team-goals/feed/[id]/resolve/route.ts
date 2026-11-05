import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import { ConflictError, HttpError } from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// PATCH /api/team-goals/feed/:id/resolve
// Blockers only. Allowed: the author, HR/admin, or a manager in the same department.
export const PATCH = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ user, params, ok }) => {
    const activity = await prisma.goalActivity.findUnique({
      where: { id: params.id },
    });
    if (!activity || !(await verifyCompanyAccess(user, activity.companyId)))
      throw new HttpError(404, "Activity item not found");
    if (activity.type !== "BLOCKER")
      throw new HttpError(400, "Only blockers can be resolved");

    const actor = await resolveGoalActor(user, activity.companyId);
    const allowed =
      actor.companyWide ||
      (!!actor.staffRecordId && activity.authorId === actor.staffRecordId) ||
      (actor.role === "MANAGER" &&
        !!activity.departmentId &&
        activity.departmentId === actor.departmentId);
    if (!allowed) throw new HttpError(403, "You cannot resolve this blocker");

    const cas = await prisma.goalActivity.updateMany({
      where: { id: activity.id, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });
    if (cas.count !== 1)
      throw new ConflictError("This blocker is already resolved");
    return ok(
      await prisma.goalActivity.findUniqueOrThrow({
        where: { id: activity.id },
      }),
    );
  },
);
