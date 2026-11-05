import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext, resolveRatingBounds } from "@/app/lib/self-appraisal";
import {
  OPEN_CYCLE_STATUSES,
  REVIEW_INCLUDE,
  assertReviewEditable,
  canAccess,
  computeMetrics,
  loadParticipant,
  parseReviewPayload,
  resolveActor,
  resolveRatingScales,
  seedCompetencies,
  serializeReview,
  startParticipantPhase,
} from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/team-reviews/:participantId/review?companyId=...
// Returns the manager review, creating the draft the first time it is opened.
// A draft's metrics are computed live; a submitted review's are the frozen snapshot.
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
    const participant = await loadParticipant(participantId, companyId);
    if (!participant || !canAccess(actor, participant))
      return withCors(
        ApiResponse.error("Employee review not found", 404),
        origin,
      );

    let review = participant.managerReview;

    if (!review) {
      const { cycle } = participant;
      if (!actor.staffRecordId)
        return withCors(
          ApiResponse.error(
            "A staff record is required to start a review",
            403,
          ),
          origin,
        );
      if (!(OPEN_CYCLE_STATUSES as readonly string[]).includes(cycle.status))
        return withCors(
          ApiResponse.error(
            "The appraisal cycle is not open for manager reviews",
            409,
          ),
          origin,
        );
      if (
        !cycle.phases.some((p) => p.phaseType === "MANAGER_REVIEW" && p.enabled)
      )
        return withCors(
          ApiResponse.error(
            "Manager review is not enabled for this cycle",
            409,
          ),
          origin,
        );
      // The manager reviews after the employee has submitted (when that phase is on)
      const selfPhaseOn = cycle.phases.some(
        (p) => p.phaseType === "SELF_APPRAISAL" && p.enabled,
      );
      if (selfPhaseOn && participant.selfAppraisal?.status !== "SUBMITTED")
        return withCors(
          ApiResponse.error(
            "This employee has not submitted their self appraisal yet",
            409,
          ),
          origin,
        );

      const seed = await seedCompetencies(participant);
      const actorId = actor.staffRecordId;

      try {
        review = await prisma.$transaction(async (tx) => {
          const created = await tx.managerReview.create({
            data: {
              companyId,
              cycleId: participant.cycleId,
              participantId: participant.id,
              staffRecordId: participant.staffRecordId,
              reviewerId: participant.managerId ?? null,
              templateVersionId: seed.templateVersionId,
              competencyRatings: {
                create: seed.competencies.map((c, i) => ({
                  competencyId: c.id,
                  competencyName: c.name,
                  competencyDescription: c.description,
                  displayOrder: i,
                })),
              },
            },
          });
          await tx.managerReviewHistory.create({
            data: {
              managerReviewId: created.id,
              companyId,
              action: "CREATED",
              actorId,
              newData: {
                competencyCount: seed.competencies.length,
                templateVersionId: seed.templateVersionId,
              },
            },
          });
          return tx.managerReview.findUniqueOrThrow({
            where: { id: created.id },
            include: REVIEW_INCLUDE,
          });
        });
      } catch (e) {
        // Two simultaneous first-opens: the unique participantId wins, reload it
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          review = await prisma.managerReview.findUnique({
            where: { participantId: participant.id },
            include: REVIEW_INCLUDE,
          });
        } else {
          throw e;
        }
      }
    }

    if (!review)
      return withCors(
        ApiResponse.error("Manager review not found", 404),
        origin,
      );

    const metrics =
      review.status === "SUBMITTED"
        ? {
            kpiScore: review.kpiScore,
            competencyScore: review.competencyScore,
            overallScore: review.overallScore,
          }
        : await computeMetrics({
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

    return withCors(
      ApiResponse.success(
        serializeReview({ review, participant, metrics, scales }),
        "Manager review retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PUT /api/team-reviews/:participantId/review
// body: { companyId, finalComments?, recommendation?, acknowledged?,
//         competencies?: [{ competencyId, rating?, comment? }] }
// Partial: only what is sent is written. Score snapshots are recomputed on every save.
export async function PUT(
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
        ApiResponse.error("A staff record is required to edit reviews", 403),
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

    const parsed = parseReviewPayload(body);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);

    // Every competency must already belong to this review
    const known = new Set(review.competencyRatings.map((c) => c.competencyId));
    for (const c of parsed.competencies) {
      if (!known.has(c.competencyId))
        return withCors(
          ApiResponse.error(
            `Competency ${c.competencyId} is not part of this review`,
            400,
          ),
          origin,
        );
    }

    // Ratings must sit inside the competency's proficiency scale
    const bounds = await resolveRatingBounds(
      companyId,
      parsed.competencies.map((c) => c.competencyId),
    );
    for (const c of parsed.competencies) {
      if (c.rating === undefined || c.rating === null) continue;
      const b = bounds.get(c.competencyId) ?? { min: 1, max: 5 };
      if (c.rating < b.min || c.rating > b.max)
        return withCors(
          ApiResponse.error(
            `rating must be between ${b.min} and ${b.max}`,
            400,
          ),
          origin,
        );
    }

    // Scores are computed from the ratings AS THEY WILL BE after this save
    const incoming = new Map(
      parsed.competencies.map((c) => [c.competencyId, c]),
    );
    const merged = review.competencyRatings.map((r) => {
      const c = incoming.get(r.competencyId);
      return {
        competencyId: r.competencyId,
        rating: c && c.rating !== undefined ? c.rating : r.rating,
      };
    });
    const metrics = await computeMetrics({
      companyId,
      cycle: participant.cycle,
      staffRecordId: participant.staffRecordId,
      templateVersionId: review.templateVersionId,
      ratings: merged,
    });

    await prisma.$transaction(async (tx) => {
      await tx.managerReview.update({
        where: { id: review.id },
        data: {
          ...parsed.data,
          kpiScore: metrics.kpiScore,
          competencyScore: metrics.competencyScore,
          overallScore: metrics.overallScore,
        },
      });

      for (const c of parsed.competencies) {
        await tx.managerReviewCompetencyRating.update({
          where: {
            managerReviewId_competencyId: {
              managerReviewId: review.id,
              competencyId: c.competencyId,
            },
          },
          data: {
            ...(c.rating !== undefined && { rating: c.rating }),
            ...(c.comment !== undefined && { comment: c.comment }),
          },
        });
      }

      await startParticipantPhase(tx, participant.id, "MANAGER_REVIEW");

      await tx.managerReviewHistory.create({
        data: {
          managerReviewId: review.id,
          companyId,
          action: "DRAFT_SAVED",
          actorId,
          newData: { sections: parsed.sections }, // which sections, not the text
        },
      });
    });

    const updated = await prisma.managerReview.findUniqueOrThrow({
      where: { id: review.id },
      include: REVIEW_INCLUDE,
    });

    const scales = await resolveRatingScales(
      companyId,
      updated.competencyRatings.map((c) => c.competencyId),
    );

    return withCors(
      ApiResponse.success(
        serializeReview({ review: updated, participant, metrics, scales }),
        "Draft saved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
