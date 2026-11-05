import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  MAX_TITLE,
  PLAN_INCLUDE,
  authorize,
  canWrite,
  loadPlan,
  logDevAction,
  serializePlan,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/development-plans/:id/duplicate  body: { companyId }
// Copies the objective, competency, mentor, description and milestone TITLES.
// Progress, ticks, due dates, evidence and activities are not copied.
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

    const plan = await loadPlan(id, companyId);
    if (!plan || !canWrite(a.auth, plan))
      return withCors(
        ApiResponse.notFound("Development plan not found"),
        origin,
      );

    const copy = await prisma.$transaction(async (tx) => {
      const created = await tx.developmentPlan.create({
        data: {
          companyId,
          staffRecordId: plan.staffRecordId,
          title: `${plan.title} (Copy)`.slice(0, MAX_TITLE),
          description: plan.description,
          competencyId: plan.competencyId,
          careerAlignment: plan.careerAlignment,
          mentorId: plan.mentorId,
          targetDate:
            plan.targetDate && plan.targetDate > new Date()
              ? plan.targetDate
              : null,
          createdById: actorId,
          milestones: {
            create: plan.milestones.map((m, i) => ({
              title: m.title,
              displayOrder: i,
            })),
          },
        },
        include: PLAN_INCLUDE,
      });
      await logDevAction(tx, {
        planId: created.id,
        companyId,
        actorId,
        action: "DUPLICATED",
        newData: { progress: 0, fromPlanId: id },
      });
      return created;
    });

    return withCors(
      ApiResponse.success(
        serializePlan(copy),
        "Development plan duplicated successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
