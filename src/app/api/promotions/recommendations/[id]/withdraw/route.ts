import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, writeCtx } from "@/app/lib/pip";
import {
  REC_INCLUDE,
  canViewRec,
  logPromotion,
  recPermissions,
} from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/promotions/recommendations/:id/withdraw   body: { companyId }
// DRAFT or SUBMITTED, by the creator or a company-wide role. Frees the employee for a new recommendation.
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
    if (rec.status !== "DRAFT" && rec.status !== "SUBMITTED")
      return fail(origin, "This recommendation is already closed", 409);
    if (!recPermissions(actor, rec).canWithdraw)
      return fail(
        origin,
        "Only the author or HR can withdraw this recommendation",
        403,
      );

    const flipped = await prisma.$transaction(async (tx) => {
      const r = await tx.promotionRecommendation.updateMany({
        where: { id, companyId, status: rec.status },
        data: { status: "WITHDRAWN", openKey: null, withdrawnAt: new Date() },
      });
      if (r.count !== 1) return false;
      await logPromotion(tx, {
        recommendationId: id,
        companyId,
        action: "WITHDRAWN",
        actorId: staffId,
        previousData: { status: rec.status },
        newData: { status: "WITHDRAWN" },
      });
      return true;
    });
    if (!flipped)
      return fail(
        origin,
        "This recommendation was changed by someone else. Refresh and try again",
        409,
      );
    return ok(origin, { id, status: "WITHDRAWN" }, "Recommendation withdrawn");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
