import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  MAX_TEXT,
  authorize,
  logDevAction,
  nameOf,
  norm,
  notifyStaff,
} from "@/app/lib/development-plans/dev-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/development-plans/coaching-requests/:requestId/respond
// body: { companyId, decision: "ACCEPTED" | "DECLINED", note? }
// The requested coach (or HR/Admin) decides. Accepting adds a COACHING activity to
// the plan (the icon chip on the card); the requester is notified in-app.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ requestId: string }>,
) {
  const origin = request.headers.get("origin");
  const bad = (m: string, s = 400) => withCors(ApiResponse.error(m, s), origin);
  try {
    const { requestId } = await context.params;
    const body = await request.json();
    const a = await authorize(request, body?.companyId);
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const decision = norm(body.decision);
    if (decision !== "ACCEPTED" && decision !== "DECLINED")
      return bad("decision must be ACCEPTED or DECLINED");
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > MAX_TEXT)
      return bad(`note must be ${MAX_TEXT} characters or fewer`);

    const req = await prisma.developmentCoachingRequest.findFirst({
      where: { id: requestId, companyId },
      include: {
        coach: { select: { firstName: true, lastName: true } },
        plan: {
          select: {
            id: true,
            title: true,
            status: true,
            _count: { select: { activities: true } },
          },
        },
      },
    });
    if (!req || !(a.auth.isHr || req.coachId === actorId))
      return withCors(
        ApiResponse.notFound("Coaching request not found"),
        origin,
      );
    if (req.status !== "PENDING")
      return bad("This request has already been answered", 409);
    if (decision === "ACCEPTED" && req.plan.status === "ARCHIVED")
      return bad(
        "The plan was removed, so this request can only be declined",
        409,
      );

    const result = await prisma.$transaction(async (tx) => {
      // Conditional update guards against a double answer
      const flipped = await tx.developmentCoachingRequest.updateMany({
        where: { id: requestId, companyId, status: "PENDING" },
        data: {
          status: decision,
          respondedById: actorId,
          respondedAt: new Date(),
          responseNote: note || null,
        },
      });
      if (flipped.count !== 1) return null;

      if (decision === "ACCEPTED")
        await tx.developmentPlanActivity.create({
          data: {
            planId: req.plan.id,
            type: "COACHING",
            title: `Coaching with ${nameOf(req.coach) ?? "your coach"}`,
            status: "PLANNED",
            displayOrder: req.plan._count.activities,
            coachingRequestId: req.id,
          },
        });
      await logDevAction(tx, {
        planId: req.plan.id,
        companyId,
        actorId,
        action:
          decision === "ACCEPTED" ? "COACHING_ACCEPTED" : "COACHING_DECLINED",
        note: note || null,
        newData: { requestId },
      });
      await notifyStaff(tx, {
        companyId,
        userId: req.requesterId,
        type:
          decision === "ACCEPTED" ? "COACHING_ACCEPTED" : "COACHING_DECLINED",
        title:
          decision === "ACCEPTED"
            ? "Coaching request accepted"
            : "Coaching request declined",
        message: `Your coaching request for "${req.plan.title}" was ${decision === "ACCEPTED" ? "accepted" : "declined"}.${note ? ` Note: ${note}` : ""}`,
        data: { requestId, planId: req.plan.id },
      });
      return tx.developmentCoachingRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: {
          id: true,
          status: true,
          respondedAt: true,
          responseNote: true,
        },
      });
    });

    if (!result) return bad("This request has already been answered", 409);
    return withCors(
      ApiResponse.success(
        result,
        decision === "ACCEPTED"
          ? "Coaching request accepted"
          : "Coaching request declined",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
