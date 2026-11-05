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

// DELETE /api/promotions/recommendations/:id/attachments/:attachmentId?companyId   Soft remove, DRAFT only
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string; attachmentId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, attachmentId } = await context.params;
    const c = await writeCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const rec = await prisma.promotionRecommendation.findFirst({
      where: { id, companyId },
      include: REC_INCLUDE,
    });
    if (!rec || !canViewRec(actor, rec))
      return notFound(origin, "Recommendation");
    if (rec.status !== "DRAFT")
      return fail(
        origin,
        "Files can only change while the recommendation is a draft",
        409,
      );
    if (!recPermissions(actor, rec).canAttach)
      return fail(origin, "You cannot change this recommendation", 403);
    const att = rec.attachments.find((x) => x.id === attachmentId);
    if (!att) return notFound(origin, "File");

    await prisma.$transaction(async (tx) => {
      await tx.promotionAttachment.update({
        where: { id: attachmentId },
        data: { removedAt: new Date() },
      });
      await logPromotion(tx, {
        recommendationId: id,
        companyId,
        action: "ATTACHMENT_REMOVED",
        actorId: staffId,
        previousData: { fileName: att.fileName },
      });
    });
    return ok(origin, { id: attachmentId, removed: true }, "File removed");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
