import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  MAX_MILESTONES,
  PLAN_INCLUDE,
  authorize,
  canWrite,
  loadPlan,
  logDevAction,
  parseMilestoneInput,
  serializePlan,
  settleProgress,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/development-plans/:id/milestones
// body: { companyId, title, dueDate? }
// Adding an open milestone lowers progress, which reopens a COMPLETED plan.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const body = await request.json();
    const a = await authorize(request, body?.companyId);
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const input = parseMilestoneInput(body);
    if (!input)
      return withCors(
        ApiResponse.error(
          "title is required; dueDate must be a valid date (YYYY-MM-DD)",
          400,
        ),
        origin,
      );
    const plan = await loadPlan(id, companyId);
    if (!plan || !canWrite(a.auth, plan))
      return withCors(
        ApiResponse.notFound("Development plan not found"),
        origin,
      );
    if (plan.milestones.length >= MAX_MILESTONES)
      return withCors(
        ApiResponse.error(
          `A plan can have at most ${MAX_MILESTONES} milestones`,
          409,
        ),
        origin,
      );

    const updated = await prisma.$transaction(async (tx) => {
      const created = await tx.developmentMilestone.create({
        data: {
          planId: id,
          title: input.title,
          dueDate: input.dueDate,
          displayOrder: plan.milestones.length,
        },
      });
      const settled = await settleProgress(
        tx,
        plan,
        [...plan.milestones, created],
        null,
      );
      await logDevAction(tx, {
        planId: id,
        companyId,
        actorId,
        action: "MILESTONE_ADDED",
        newData: { title: input.title, progress: settled.progress },
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
        "Milestone added successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
