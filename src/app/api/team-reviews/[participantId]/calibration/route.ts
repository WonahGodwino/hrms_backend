import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  MAX_LONG_TEXT,
  RouteContext,
  resolveRatingBounds,
} from "@/app/lib/self-appraisal";
import {
  assertCalibratable,
  buildCalibrationItems,
  competencyScore,
  employeeInfo,
  loadParticipant,
  overallScore,
  resolveActor,
  resolveScoreWeights,
  startParticipantPhase,
} from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/team-reviews/:participantId/calibration?companyId=...
// Lists the employee's rated competencies, self vs manager, inconsistent ones first.
// HR / ADMIN / SUPER_ADMIN only.
export async function GET(
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
    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const actor = await resolveActor(user, companyId);
    if (!actor.companyWide)
      return withCors(
        ApiResponse.error("Only HR or admin users can calibrate reviews", 403),
        origin,
      );

    const participant = await loadParticipant(participantId, companyId);
    if (!participant)
      return withCors(
        ApiResponse.error("Employee review not found", 404),
        origin,
      );

    const blocked = assertCalibratable(participant);
    if (blocked) return withCors(ApiResponse.error(blocked, 409), origin);

    const review = participant.managerReview;
    if (!review)
      return withCors(
        ApiResponse.error("Employee review not found", 404),
        origin,
      );

    return withCors(
      ApiResponse.success(
        {
          participantId: participant.id,
          employee: employeeInfo(participant),
          overallScore: review.overallScore,
          calibratedOverallScore: review.calibratedOverallScore,
          items: await buildCalibrationItems(participant),
        },
        "Calibration data retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/team-reviews/:participantId/calibration
// body: { companyId, competencyId, calibratedRating, justification }
// Sets the calibrated rating for one competency. The manager's original rating and
// overallScore are never overwritten; calibratedOverallScore is recomputed.
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
    const { companyId, competencyId, calibratedRating } = body ?? {};
    const justification =
      typeof body?.justification === "string" ? body.justification.trim() : "";
    if (
      !companyId ||
      typeof companyId !== "string" ||
      typeof competencyId !== "string"
    )
      return withCors(
        ApiResponse.error(
          "Missing required fields: companyId, competencyId",
          400,
        ),
        origin,
      );
    if (!Number.isInteger(calibratedRating))
      return withCors(
        ApiResponse.error("calibratedRating must be an integer", 400),
        origin,
      );
    if (!justification)
      return withCors(
        ApiResponse.error("A justification is required", 400),
        origin,
      );
    if (justification.length > MAX_LONG_TEXT)
      return withCors(
        ApiResponse.error(
          `justification must be at most ${MAX_LONG_TEXT} characters`,
          400,
        ),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const actor = await resolveActor(user, companyId);
    if (!actor.companyWide)
      return withCors(
        ApiResponse.error("Only HR or admin users can calibrate reviews", 403),
        origin,
      );
    if (!actor.staffRecordId)
      return withCors(
        ApiResponse.error(
          "A staff record is required to calibrate reviews",
          403,
        ),
        origin,
      );
    const actorId = actor.staffRecordId;

    const participant = await loadParticipant(participantId, companyId);
    if (!participant)
      return withCors(
        ApiResponse.error("Employee review not found", 404),
        origin,
      );

    const blocked = assertCalibratable(participant);
    if (blocked) return withCors(ApiResponse.error(blocked, 409), origin);

    const review = participant.managerReview;
    if (!review)
      return withCors(
        ApiResponse.error("Employee review not found", 404),
        origin,
      );

    const row = review.competencyRatings.find(
      (c) => c.competencyId === competencyId,
    );
    if (!row)
      return withCors(
        ApiResponse.error("Competency is not part of this review", 400),
        origin,
      );
    if (row.rating === null)
      return withCors(
        ApiResponse.error(
          "This competency has no manager rating to calibrate",
          409,
        ),
        origin,
      );

    // Rating must sit inside the competency's proficiency scale
    const bounds = await resolveRatingBounds(
      companyId,
      review.competencyRatings.map((c) => c.competencyId),
    );
    const b = bounds.get(competencyId) ?? { min: 1, max: 5 };
    if (calibratedRating < b.min || calibratedRating > b.max)
      return withCors(
        ApiResponse.error(
          `calibratedRating must be between ${b.min} and ${b.max}`,
          400,
        ),
        origin,
      );

    // Recompute from EFFECTIVE ratings; the KPI score stays as frozen at submit
    const effective = review.competencyRatings.map((c) => ({
      competencyId: c.competencyId,
      rating:
        c.competencyId === competencyId
          ? (calibratedRating as number)
          : (c.calibratedRating ?? c.rating),
    }));
    const weights = await resolveScoreWeights(review.templateVersionId);
    const newOverall = overallScore(
      review.kpiScore,
      competencyScore(effective, bounds),
      weights,
    );
    const previousOverall =
      review.calibratedOverallScore ?? review.overallScore;

    await prisma.$transaction(async (tx) => {
      await tx.managerReviewCompetencyRating.update({
        where: {
          managerReviewId_competencyId: {
            managerReviewId: review.id,
            competencyId,
          },
        },
        data: {
          calibratedRating: calibratedRating as number,
          calibrationNote: justification,
        },
      });
      await tx.managerReview.update({
        where: { id: review.id },
        data: { calibratedOverallScore: newOverall },
      });
      await startParticipantPhase(tx, participant.id, "LEADERSHIP_CALIBRATION");
      await tx.managerReviewHistory.create({
        data: {
          managerReviewId: review.id,
          companyId,
          action: "CALIBRATED",
          actorId,
          previousData: {
            competencyId,
            competencyName: row.competencyName,
            rating: row.calibratedRating ?? row.rating,
            overallScore: previousOverall,
          },
          newData: {
            competencyId,
            calibratedRating: calibratedRating as number,
            justification,
            overallScore: newOverall,
          },
        },
      });

      try {
        const { emitAutomationEvent } = require("@/app/lib/automation-events");
        const nowMs = Date.now();
        await emitAutomationEvent(tx, {
          companyId,
          trigger: "RATING_FINALIZED",
          eventKey: `RATING_FINALIZED:${participant.id}:${nowMs}`,
          entityType: "PARTICIPANT",
          entityId: participant.id,
          subjectStaffRecordId: participant.staffRecordId,
          payload: {
            participantId: participant.id,
            cycleId: participant.cycleId,
            reviewId: review.id,
            calibratedOverallScore: newOverall,
          },
        });
      } catch {}
    });

    try {
      const { kickAutomation } = require("@/app/lib/automation-events");
      kickAutomation(companyId);
    } catch {}

    const fresh = await loadParticipant(participantId, companyId);
    return withCors(
      ApiResponse.success(
        {
          overallScore: review.overallScore,
          calibratedOverallScore: newOverall,
          items: fresh ? await buildCalibrationItems(fresh) : [],
        },
        "Calibration applied successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
