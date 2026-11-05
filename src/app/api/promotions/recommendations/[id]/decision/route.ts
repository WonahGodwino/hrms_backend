import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, readText, writeCtx } from "@/app/lib/pip";
import { notifyPromotionDecided } from "@/app/lib/promotion-notify";
import {
  PROMO_LIMITS,
  REC_INCLUDE,
  canViewRec,
  logPromotion,
  recPermissions,
} from "@/app/lib/promotion";
import { estimateCompensation } from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/promotions/recommendations/:id/decision
// body: { companyId, decision: "APPROVED" | "REJECTED", decisionNote? }   (decisions 1, 2, 11, 34)
// HR/Admin only. Approval records intent: StaffRecord, grade history and salary are not touched.
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

    const decision = body?.decision;
    if (decision !== "APPROVED" && decision !== "REJECTED")
      return fail(origin, "decision must be APPROVED or REJECTED");
    const note = readText(
      body.decisionNote,
      "decisionNote",
      PROMO_LIMITS.note,
      {
        required: decision === "REJECTED",
        min: decision === "REJECTED" ? PROMO_LIMITS.decisionNoteMin : undefined,
      },
    );
    if ("error" in note) return fail(origin, note.error);

    const rec = await prisma.promotionRecommendation.findFirst({
      where: { id, companyId },
      include: REC_INCLUDE,
    });
    if (!rec || !canViewRec(actor, rec))
      return notFound(origin, "Recommendation");
    if (rec.status !== "SUBMITTED")
      return fail(
        origin,
        "Only a submitted recommendation can be decided",
        409,
      );
    if (!actor.companyWide)
      return fail(
        origin,
        "Only HR or an administrator can decide a recommendation",
        403,
      );
    if (!recPermissions(actor, rec).canDecide)
      return fail(
        origin,
        "You cannot decide your own recommendation or one about yourself",
        403,
      );

    const comp = await estimateCompensation(
      companyId,
      rec.staffRecordId,
      rec.targetDesignationId,
    );
    const now = new Date();

    const flipped = await prisma.$transaction(async (tx) => {
      const r = await tx.promotionRecommendation.updateMany({
        where: { id, companyId, status: "SUBMITTED" },
        data: {
          status: decision,
          decidedAt: now,
          decidedById: staffId,
          decisionNote: note.value,
          openKey: null,
        },
      });
      if (r.count !== 1) return false;

      if (decision === "APPROVED") {
        await tx.staffCareerHistory.create({
          data: {
            companyId,
            staffId: rec.staffRecordId,
            previousDesignationId: rec.currentDesignationId,
            newDesignationId: rec.targetDesignationId,
            effectiveDate: rec.effectiveDate,
            reason: `Performance Promotion (${rec.targetRoleTitle})`,
            promotionRecId: id,
          },
        });
        await tx.staffRecord.update({
          where: { id: rec.staffRecordId },
          data: {
            designationId: rec.targetDesignationId,
            position: rec.targetRoleTitle,
          },
        });
      }

      await logPromotion(tx, {
        recommendationId: id,
        companyId,
        action: decision,
        actorId: staffId,
        previousData: { status: "SUBMITTED" },
        newData: {
          status: decision,
          hasNote: !!note.value,
          decidedAt: now.toISOString(),
          compensationEstimate: comp,
        },
      });
      return true;
    });
    if (!flipped)
      return fail(
        origin,
        "This recommendation was already decided. Refresh and try again",
        409,
      );
    await notifyPromotionDecided({
      companyId,
      recommendationId: id,
      actorId: staffId,
    });
    return ok(
      origin,
      { id, status: decision },
      decision === "APPROVED"
        ? "Recommendation approved"
        : "Recommendation rejected",
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
