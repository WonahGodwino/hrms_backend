import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { describeScore } from "@/app/lib/manager-review";
import { notFound, ok } from "@/app/lib/pip";
import { REC_INCLUDE, serializeRec } from "@/app/lib/promotion";
import { dashCtx, estimateCompensation } from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/approvals/:id?companyId   Approval modal data (decisions 4, 5)
// Saving goes through POST /api/promotions/recommendations/:id/decision.
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await dashCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const rec = await prisma.promotionRecommendation.findFirst({
      where: { id, companyId },
      include: REC_INCLUDE,
    });
    if (!rec) return notFound(origin, "Recommendation");
    const d = describeScore(rec.overallScore);
    return ok(origin, {
      ...serializeRec(rec, actor),
      performance: {
        pct: rec.overallScore === null ? null : Math.round(rec.overallScore),
        outOfFive: d.outOfFive,
        label: d.label,
      },
      compensation: await estimateCompensation(
        companyId,
        rec.staffRecordId,
        rec.targetDesignationId,
      ),
      noStaffRecordNote: actor.staffRecordId
        ? null
        : "Your account has no staff record in this company, so you can read this recommendation but not decide it.",
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
