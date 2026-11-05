import { NextRequest } from "next/server";
import { CareerActionType, DevelopmentActivityType } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  fail,
  nameOf,
  ok,
  parseDateOnly,
  readText,
  startOfUtcDay,
  writeCtx,
} from "@/app/lib/pip";
import { notifyCareerActionAssigned } from "@/app/lib/promotion-notify";
import { PROMO_LIMITS, loadScopedStaff } from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const ACTIVITY_TYPE: Record<CareerActionType, DevelopmentActivityType> = {
  LEADERSHIP_PROGRAM: "COURSE",
  TECHNICAL_TRAINING: "COURSE",
  MENTORSHIP: "COACHING",
  STRETCH_ASSIGNMENT: "PROJECT",
};

// POST /api/promotions/development-assignments   (decisions 26, 27)
// body: { companyId, staffRecordId, actionType, title?, trainingProgramId?, mentorId?, objectives,
//         targetDate, followUpDate?, competencyId? }
// Creates one DevelopmentPlan, one DevelopmentPlanActivity and the CareerDevelopmentAssignment marker.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    if (typeof body.staffRecordId !== "string")
      return fail(origin, "Missing required field: staffRecordId");
    if (!Object.values(CareerActionType).includes(body.actionType))
      return fail(
        origin,
        `actionType must be one of: ${Object.values(CareerActionType).join(", ")}`,
      );
    const actionType = body.actionType as CareerActionType;

    const objectives = readText(
      body.objectives,
      "objectives",
      PROMO_LIMITS.objectives,
      { required: true, min: PROMO_LIMITS.objectivesMin },
    );
    if ("error" in objectives) return fail(origin, objectives.error);
    const targetDate = parseDateOnly(body.targetDate);
    if (!targetDate)
      return fail(origin, "targetDate must be a valid YYYY-MM-DD date");
    const today = startOfUtcDay();
    const maxDate = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth() + PROMO_LIMITS.targetMonths,
        today.getUTCDate(),
      ),
    );
    if (targetDate <= today)
      return fail(origin, "The target completion date must be in the future");
    if (targetDate > maxDate)
      return fail(
        origin,
        `The target completion date must be within ${PROMO_LIMITS.targetMonths} months`,
      );
    const followUpDate = body.followUpDate
      ? parseDateOnly(body.followUpDate)
      : null;
    if (body.followUpDate && !followUpDate)
      return fail(origin, "followUpDate must be a valid YYYY-MM-DD date");
    if (followUpDate && (followUpDate < today || followUpDate > targetDate))
      return fail(
        origin,
        "The follow-up date must fall between today and the target date",
      );

    const staff = await loadScopedStaff(
      prisma,
      companyId,
      body.staffRecordId,
      actor,
    );
    if (!staff) return fail(origin, "Employee not found", 404);
    if (!staff.isActive)
      return fail(origin, "This employee is not active", 409);
    if (staff.id === staffId)
      return fail(
        origin,
        "You cannot assign a development action to yourself",
        403,
      );

    // Title, program and mentor
    let program: { id: string; programName: string } | null = null;
    if (body.trainingProgramId) {
      program = await prisma.trainingProgram.findFirst({
        where: {
          id: String(body.trainingProgramId),
          companyId,
          status: "ACTIVE",
          deletedAt: null,
        },
        select: { id: true, programName: true },
      });
      if (!program)
        return fail(origin, "Training program not found or not active", 404);
    }
    let mentorId: string | null = staff.managerId;
    let title: string;
    if (actionType === "MENTORSHIP") {
      const mentor =
        typeof body.mentorId === "string" && body.mentorId !== staff.id
          ? await prisma.staffRecord.findFirst({
              where: { id: body.mentorId, companyId, isActive: true },
              select: { id: true, firstName: true, lastName: true },
            })
          : null;
      if (!mentor)
        return fail(origin, "Choose an active mentor other than the employee");
      mentorId = mentor.id;
      title = `Mentorship: ${nameOf(mentor)}`;
    } else {
      const t = readText(
        body.title ?? program?.programName,
        "title",
        PROMO_LIMITS.programName,
        { required: true },
      );
      if ("error" in t) return fail(origin, t.error);
      title = t.value as string;
    }
    let competencyId: string | null = null;
    if (body.competencyId) {
      const comp = await prisma.competency.findFirst({
        where: {
          id: String(body.competencyId),
          companyId,
          status: { not: "ARCHIVED" },
        },
        select: { id: true },
      });
      if (!comp) return fail(origin, "Competency not found", 404);
      competencyId = comp.id;
    }

    const result = await prisma.$transaction(async (tx) => {
      const open = await tx.careerDevelopmentAssignment.count({
        where: {
          companyId,
          staffRecordId: staff.id,
          plan: { status: "ACTIVE" },
        },
      });
      if (open >= PROMO_LIMITS.openAssignments)
        return {
          error: `This employee already has ${PROMO_LIMITS.openAssignments} open assigned development plans`,
        };
      const plan = await tx.developmentPlan.create({
        data: {
          companyId,
          staffRecordId: staff.id,
          title,
          description: objectives.value,
          competencyId,
          mentorId,
          status: "ACTIVE",
          progress: 0,
          targetDate,
          createdById: staffId,
        },
        select: { id: true },
      });
      await tx.developmentPlanActivity.create({
        data: {
          planId: plan.id,
          type: ACTIVITY_TYPE[actionType],
          title,
          status: "PLANNED",
          dueDate: targetDate,
          trainingProgramId: program?.id ?? null,
        },
      });
      await tx.careerDevelopmentAssignment.create({
        data: {
          companyId,
          staffRecordId: staff.id,
          assignedById: staffId,
          planId: plan.id,
          actionType,
          followUpDate,
        },
      });
      await tx.developmentPlanHistory.create({
        data: {
          planId: plan.id,
          companyId,
          action: "ASSIGNED_BY_MANAGER",
          actorId: staffId,
          newData: {
            actionType,
            targetDate: targetDate.toISOString(),
            mentorId,
          },
        },
      });
      return { planId: plan.id };
    });
    if ("error" in result) return fail(origin, result.error as string, 409);
    await notifyCareerActionAssigned({
      companyId,
      planId: result.planId,
      staffRecordId: staff.id,
      actorId: staffId,
      title,
    });
    return ok(
      origin,
      { planId: result.planId, title },
      "Development action assigned",
      201,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
