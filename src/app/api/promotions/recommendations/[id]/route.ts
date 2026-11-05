import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  fail,
  notFound,
  ok,
  parseDateOnly,
  readCtx,
  readText,
  writeCtx,
} from "@/app/lib/pip";
import {
  PROMO_LIMITS,
  REC_INCLUDE,
  canViewRec,
  logPromotion,
  recPermissions,
  serializeRec,
  validateEffectiveDate,
  validateTarget,
} from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/promotions/recommendations/:id?companyId
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await readCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const rec = await prisma.promotionRecommendation.findFirst({
      where: { id, companyId: c.ctx.companyId },
      include: REC_INCLUDE,
    });
    if (!rec || !canViewRec(c.ctx.actor, rec))
      return notFound(origin, "Recommendation");
    return ok(origin, serializeRec(rec, c.ctx.actor));
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PATCH /api/promotions/recommendations/:id
// body: { companyId, targetDesignationId?, targetGradeId?, effectiveDate?, justification? }. DRAFT only (decision 11).
export async function PATCH(
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
      return fail(origin, "Only a draft recommendation can be edited", 409);
    if (!recPermissions(actor, rec).canEdit)
      return fail(origin, "You cannot edit this recommendation", 403);

    const data: Prisma.PromotionRecommendationUncheckedUpdateInput = {};
    const prev: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};

    if (body.targetDesignationId !== undefined) {
      const desId = String(body.targetDesignationId);
      const t = await validateTarget(prisma, companyId, {
        targetDesignationId: desId,
        currentDesignationId: rec.currentDesignationId,
      });
      if ("error" in t) return fail(origin, t.error, t.status);
      if (t.designation.id !== rec.targetDesignationId) {
        data.targetDesignationId = t.designation.id;
        data.targetRoleTitle = t.designation.title;
        prev.targetDesignationId = rec.targetDesignationId;
        next.targetDesignationId = t.designation.id;
      }
    }
    if (body.projectedSalaryChange !== undefined) {
      const num = body.projectedSalaryChange !== null ? Number(body.projectedSalaryChange) : null;
      if (num !== null && !Number.isNaN(num)) {
        data.projectedSalaryChange = num;
        prev.projectedSalaryChange = rec.projectedSalaryChange ? Number(rec.projectedSalaryChange) : null;
        next.projectedSalaryChange = num;
      }
    }
    if (body.effectiveDate !== undefined) {
      const d = parseDateOnly(body.effectiveDate);
      if (!d)
        return fail(origin, "effectiveDate must be a valid YYYY-MM-DD date");
      if (d.getTime() !== rec.effectiveDate.getTime()) {
        const err = validateEffectiveDate(d);
        if (err) return fail(origin, err);
        data.effectiveDate = d;
        prev.effectiveDate = rec.effectiveDate.toISOString();
        next.effectiveDate = d.toISOString();
      }
    }
    if (body.justification !== undefined) {
      const j = readText(
        body.justification,
        "justification",
        PROMO_LIMITS.justification,
      );
      if ("error" in j) return fail(origin, j.error);
      if (j.value !== rec.justification) {
        data.justification = j.value;
        next.justification = "changed";
      } // never the full text
    }
    if (!Object.keys(data).length)
      return ok(origin, { id, changed: false }, "No changes");

    const flipped = await prisma.$transaction(async (tx) => {
      const r = await tx.promotionRecommendation.updateMany({
        where: { id, companyId, status: "DRAFT" },
        data,
      });
      if (r.count !== 1) return false;
      await logPromotion(tx, {
        recommendationId: id,
        companyId,
        action: "UPDATED",
        actorId: staffId,
        previousData: prev as Prisma.InputJsonValue,
        newData: next as Prisma.InputJsonValue,
      });
      return true;
    });
    if (!flipped)
      return fail(
        origin,
        "This recommendation was changed by someone else. Refresh and try again",
        409,
      );
    return ok(origin, { id, changed: true }, "Recommendation updated");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
