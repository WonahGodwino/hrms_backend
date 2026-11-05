import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import { createCalibrationRecords } from "@/app/lib/calibration";
import {
  REQUIRE_COMPETENCY_RATINGS,
  REVIEW_INCLUDE,
  assertReviewEditable,
  canAccess,
  completeParticipantPhase,
  computeMetrics,
  loadParticipant,
  resolveActor,
  serializeReview,
  resolveRatingScales
} from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/team-reviews/:participantId/review/submit   body: { companyId }
// Submits the SAVED draft ("Submit to HR"). The client must PUT unsaved edits first.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ participantId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { participantId } = await context.params;
    const body = await request.json();
    const companyId = body?.companyId;
    if (!companyId || typeof companyId !== "string")
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const actor = await resolveActor(user, companyId);
    if (!actor.staffRecordId)
      return withCors(
        ApiResponse.error("A staff record is required to submit reviews", 403),
        origin,
      );
    const actorId = actor.staffRecordId;

    const participant = await loadParticipant(participantId, companyId);
    if (!participant || !canAccess(actor, participant))
      return withCors(
        ApiResponse.error("Employee review not found", 404),
        origin,
      );

    const review = participant.managerReview;
    if (!review)
      return withCors(
        ApiResponse.error(
          "This review has not been started. Open it first",
          404,
        ),
        origin,
      );

    const blocked = assertReviewEditable(review.status, participant.cycle);
    if (blocked) return withCors(ApiResponse.error(blocked, 409), origin);

    // The modal gates on the acknowledgement; the server also requires final comments
    const missing: string[] = [];
    if (!review.acknowledged) missing.push("Acknowledgement confirmed");
    if (!review.finalComments || review.finalComments.trim().length === 0)
      missing.push("Final manager comments");
    if (
      REQUIRE_COMPETENCY_RATINGS &&
      review.competencyRatings.some((c) => c.rating === null)
    )
      missing.push("All competencies rated");
    if (missing.length)
      return withCors(
        ApiResponse.error(`Review is incomplete: ${missing.join("; ")}`, 422),
        origin,
      );

    const metrics = await computeMetrics({
      companyId,
      cycle: participant.cycle,
      staffRecordId: participant.staffRecordId,
      templateVersionId: review.templateVersionId,
      ratings: review.competencyRatings,
    });

    const scales = await resolveRatingScales(
      companyId,
      review.competencyRatings.map((c) => c.competencyId),
    );

    const result = await prisma.$transaction(async (tx) => {
      // Conditional update guards against a double-submit race; scores freeze here
      const flipped = await tx.managerReview.updateMany({
        where: { id: review.id, status: "DRAFT" },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          kpiScore: metrics.kpiScore,
          competencyScore: metrics.competencyScore,
          overallScore: metrics.overallScore,
        },
      });
      if (flipped.count !== 1) return null;

      await completeParticipantPhase(tx, participant.id, "MANAGER_REVIEW");

      if (
        participant.cycle.phases.some(
          (p) => p.phaseType === "LEADERSHIP_CALIBRATION" && p.enabled,
        )
      ) {
        await createCalibrationRecords(tx, [
          {
            companyId,
            cycleId: participant.cycleId,
            participantId: participant.id,
            staffRecordId: participant.staffRecordId,
            overallScore: metrics.overallScore,
          },
        ]);
      }

      const fresh = await tx.managerReview.findUniqueOrThrow({
        where: { id: review.id },
        include: REVIEW_INCLUDE,
      });
      const payload = serializeReview({
        review: fresh,
        participant,
        metrics,
        scales,
      });

      await tx.managerReviewHistory.create({
        data: {
          managerReviewId: review.id,
          companyId,
          action: "SUBMITTED",
          actorId,
          previousData: { status: "DRAFT" },
          newData: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        },
      });

      try {
        const { emitAutomationEvent } = require("@/app/lib/automation-events");
        await emitAutomationEvent(tx, {
          companyId,
          trigger: "REVIEW_COMPLETED",
          eventKey: `REVIEW_COMPLETED:${review.id}`,
          entityType: "MANAGER_REVIEW",
          entityId: review.id,
          subjectStaffRecordId: participant.staffRecordId,
          payload: {
            managerReviewId: review.id,
            reviewId: review.id,
            cycleId: participant.cycleId,
            participantId: participant.id,
            phaseType: "MANAGER_REVIEW",
            kpiScore: metrics.kpiScore,
            overallScore: metrics.overallScore,
          },
        });
      } catch {}

      return payload;
    });

    if (!result)
      return withCors(
        ApiResponse.error("This review has already been submitted", 409),
        origin,
      );

    try {
      const { kickAutomation } = require("@/app/lib/automation-events");
      kickAutomation(companyId);
    } catch {}

    return withCors(
      ApiResponse.success(result, "Manager review submitted successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
