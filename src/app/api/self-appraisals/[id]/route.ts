import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  getStaffRecordIdFromEmail,
  UserContext,
} from "@/app/lib/access-control";
import {
  APPRAISAL_INCLUDE,
  RouteContext,
  assertEditable,
  findOwnedAppraisal,
  markPhaseStarted,
  parseDraftPayload,
  resolveRatingBounds,
  serializeAppraisal,
} from "@/app/lib/self-appraisal";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// PUT /api/self-appraisals/:id
// body: { companyId, goals?, competencies?, challenges?, career?, declaration? }
// Partial: only the sections/fields sent are written.
export async function PUT(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
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
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { id } = await context.params;
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

    const staffRecordId = await getStaffRecordIdFromEmail(user.email);
    if (!staffRecordId)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    // Strictly personal: someone else's appraisal looks like "not found"
    const appraisal = await findOwnedAppraisal(id, companyId, staffRecordId);
    if (!appraisal)
      return withCors(
        ApiResponse.error("Self appraisal not found", 404),
        origin,
      );

    const blocked = assertEditable(appraisal);
    if (blocked) return withCors(ApiResponse.error(blocked, 409), origin);

    const parsed = parseDraftPayload(body);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);

    // Every goal/competency must already belong to this appraisal
    const goalIds = new Set(appraisal.goalReflections.map((g) => g.goalId));
    for (const g of parsed.goals) {
      if (!goalIds.has(g.goalId))
        return withCors(
          ApiResponse.error(
            `Goal ${g.goalId} is not part of this appraisal`,
            400,
          ),
          origin,
        );
    }
    const competencyIds = new Set(
      appraisal.competencyRatings.map((c) => c.competencyId),
    );
    for (const c of parsed.competencies) {
      if (!competencyIds.has(c.competencyId))
        return withCors(
          ApiResponse.error(
            `Competency ${c.competencyId} is not part of this appraisal`,
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

    await prisma.$transaction(async (tx) => {
      await tx.selfAppraisal.update({
        where: { id },
        data: { ...parsed.data, updatedAt: new Date() }, // always bump "last saved"
      });

      for (const g of parsed.goals) {
        await tx.selfAppraisalGoalReflection.update({
          where: {
            selfAppraisalId_goalId: { selfAppraisalId: id, goalId: g.goalId },
          },
          data: {
            ...(g.reflection !== undefined && { reflection: g.reflection }),
            ...(g.confidence !== undefined && { confidence: g.confidence }),
          },
        });
      }

      for (const c of parsed.competencies) {
        await tx.selfAppraisalCompetencyRating.update({
          where: {
            selfAppraisalId_competencyId: {
              selfAppraisalId: id,
              competencyId: c.competencyId,
            },
          },
          data: {
            ...(c.rating !== undefined && { rating: c.rating }),
            ...(c.comment !== undefined && { comment: c.comment }),
          },
        });
      }

      await markPhaseStarted(tx, appraisal.participantId);

      await tx.selfAppraisalHistory.create({
        data: {
          selfAppraisalId: id,
          companyId,
          action: "DRAFT_SAVED",
          actorId: staffRecordId,
          newData: { sections: parsed.sections }, // which sections, not the text
        },
      });
    });

    const updated = await prisma.selfAppraisal.findUniqueOrThrow({
      where: { id },
      include: APPRAISAL_INCLUDE,
    });

    return withCors(
      ApiResponse.success(
        serializeAppraisal(updated),
        "Draft saved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
