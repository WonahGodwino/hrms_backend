import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  MAX_TEXT,
  authorize,
  canWrite,
  findEligibleCoach,
  loadPlan,
  logDevAction,
  nameOf,
  norm,
  notifyStaff,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const FREQUENCIES = ["WEEKLY", "BI_WEEKLY", "MONTHLY"] as const;
const FREQ_TEXT = {
  WEEKLY: "weekly",
  BI_WEEKLY: "bi-weekly",
  MONTHLY: "monthly",
};

// POST /api/development-plans/:id/coaching-requests
// body: { companyId, coachId, frequency ("Weekly" | "Bi-weekly" | "Monthly"),
//         message, focusCompetencyId? }
// Creates a PENDING request and notifies the coach in-app.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  const bad = (m: string, s = 400) => withCors(ApiResponse.error(m, s), origin);
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

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return bad("Missing required field: message");
    if (message.length > MAX_TEXT)
      return bad(`message must be ${MAX_TEXT} characters or fewer`);
    const frequency = norm(
      body.frequency || "BI_WEEKLY",
    ) as (typeof FREQUENCIES)[number];
    if (!FREQUENCIES.includes(frequency))
      return bad(
        `Invalid frequency. Must be one of: ${FREQUENCIES.join(", ")}`,
      );
    if (!body.coachId || typeof body.coachId !== "string")
      return bad("Missing required field: coachId");

    const requester = await prisma.staffRecord.findFirst({
      where: { id: plan.staffRecordId, companyId },
      select: { id: true, firstName: true, lastName: true, managerId: true },
    });
    if (!requester)
      return withCors(ApiResponse.notFound("Staff record not found"), origin);
    const coach = await findEligibleCoach(
      companyId,
      body.coachId,
      requester.id,
      requester.managerId,
    );
    if (!coach)
      return bad(
        "Coach must be an active manager, HR or admin in this company",
      );

    const focusCompetencyId = body.focusCompetencyId
      ? String(body.focusCompetencyId)
      : plan.competencyId;
    if (focusCompetencyId) {
      const c = await prisma.competency.findFirst({
        where: { id: focusCompetencyId, companyId },
        select: { id: true },
      });
      if (!c) return bad("Competency not found");
    }

    const dup = await prisma.developmentCoachingRequest.findFirst({
      where: { planId: id, coachId: coach.id, status: "PENDING" },
      select: { id: true },
    });
    if (dup)
      return bad(
        "A request to this coach is already pending for this plan",
        409,
      );

    const created = await prisma.$transaction(async (tx) => {
      const r = await tx.developmentCoachingRequest.create({
        data: {
          companyId,
          planId: id,
          requesterId: requester.id,
          coachId: coach.id,
          focusCompetencyId,
          frequency,
          message,
        },
      });
      await logDevAction(tx, {
        planId: id,
        companyId,
        actorId,
        action: "COACHING_REQUESTED",
        newData: { coachId: coach.id, frequency, requestId: r.id },
      });
      await notifyStaff(tx, {
        companyId,
        userId: coach.id,
        type: "COACHING_REQUESTED",
        title: "New coaching request",
        message: `${nameOf(requester)} asked for ${FREQ_TEXT[frequency]} coaching on "${plan.title}".`,
        data: { requestId: r.id, planId: id },
      });
      return r;
    });

    return withCors(
      ApiResponse.success(
        {
          id: created.id,
          status: created.status,
          frequency: created.frequency,
          coachId: coach.id,
          coach: nameOf(coach),
          createdAt: created.createdAt,
        },
        "Coaching request sent successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
