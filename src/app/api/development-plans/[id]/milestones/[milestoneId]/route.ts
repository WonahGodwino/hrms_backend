import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  PLAN_INCLUDE,
  authorize,
  canWrite,
  loadPlan,
  logDevAction,
  serializePlan,
  settleProgress,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/development-plans/:id/milestones/:milestoneId?companyId
// Milestones may be hard-deleted (same exception as goal milestones). Progress is
// recomputed; deleting the last one switches the plan to manual progress.
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string; milestoneId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, milestoneId } = await context.params;
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const plan = await loadPlan(id, companyId);
    if (!plan || !canWrite(a.auth, plan))
      return withCors(
        ApiResponse.notFound("Development plan not found"),
        origin,
      );
    const target = plan.milestones.find((m) => m.id === milestoneId);
    if (!target)
      return withCors(ApiResponse.notFound("Milestone not found"), origin);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.developmentMilestone.delete({ where: { id: milestoneId } });
      const settled = await settleProgress(
        tx,
        plan,
        plan.milestones.filter((m) => m.id !== milestoneId),
        null,
      );
      await logDevAction(tx, {
        planId: id,
        companyId,
        actorId,
        action: "MILESTONE_REMOVED",
        newData: { title: target.title, progress: settled.progress },
      });
      if (settled.transition)
        await logDevAction(tx, {
          planId: id,
          companyId,
          actorId,
          action: settled.transition,
          newData: { progress: settled.progress },
        });
      return tx.developmentPlan.findUniqueOrThrow({
        where: { id },
        include: PLAN_INCLUDE,
      });
    });

    return withCors(
      ApiResponse.success(
        serializePlan(updated),
        "Milestone removed successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
