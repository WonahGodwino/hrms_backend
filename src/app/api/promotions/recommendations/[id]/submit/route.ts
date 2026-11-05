import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, writeCtx } from "@/app/lib/pip";
import { notifyPromotionSubmitted } from "@/app/lib/promotion-notify";
import {
  PROMO_LIMITS,
  REC_INCLUDE,
  assessOne,
  canViewRec,
  logPromotion,
  recPermissions,
  snapshotFrom,
  validateEffectiveDate,
} from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/promotions/recommendations/:id/submit   body: { companyId }   (decision 10)
// Re-checks eligibility against the basis cycle and freezes the scores.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const rec = await prisma.promotionRecommendation.findFirst({
      where: { id, companyId },
      include: REC_INCLUDE,
    });
    if (!rec || !canViewRec(actor, rec))
      return notFound(origin, "Recommendation");
    if (rec.status !== "DRAFT")
      return fail(origin, "Only a draft can be submitted", 409);
    if (!recPermissions(actor, rec).canSubmit)
      return fail(origin, "You cannot submit this recommendation", 403);
    if (
      !rec.justification ||
      rec.justification.length < PROMO_LIMITS.justificationMin
    )
      return fail(
        origin,
        `A justification of at least ${PROMO_LIMITS.justificationMin} characters is required to submit`,
      );
    const dateErr = validateEffectiveDate(rec.effectiveDate);
    if (dateErr)
      return fail(origin, `${dateErr}. Update the date before submitting`, 409);

    const assessed = await assessOne(companyId, rec.staffRecordId, rec.cycleId);
    if ("error" in assessed)
      return fail(origin, assessed.error, assessed.status);
    const a = assessed.assessment;
    if (!a)
      return fail(
        origin,
        "The appraisal result this draft was based on is no longer available",
        409,
      );
    if (!a.eligible)
      return fail(
        origin,
        a.ineligibleReason ?? "This employee is no longer eligible",
        409,
      );

    const snap = snapshotFrom(a);
    const flipped = await prisma.$transaction(async (tx) => {
      const r = await tx.promotionRecommendation.updateMany({
        where: { id, companyId, status: "DRAFT" },
        data: { status: "SUBMITTED", submittedAt: new Date(), ...snap },
      });
      if (r.count !== 1) return false;
      await logPromotion(tx, {
        recommendationId: id,
        companyId,
        action: "SUBMITTED",
        actorId: staffId,
        previousData: { status: "DRAFT" },
        newData: snap as unknown as Prisma.InputJsonValue,
      });
      return true;
    });
    if (!flipped)
      return fail(
        origin,
        "This recommendation was changed by someone else. Refresh and try again",
        409,
      );
    await notifyPromotionSubmitted({
      companyId,
      recommendationId: id,
      actorId: staffId,
    });
    return ok(
      origin,
      { id, status: "SUBMITTED" },
      "Recommendation submitted to HR",
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
