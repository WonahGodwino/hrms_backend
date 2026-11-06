import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, writeCtx } from "@/app/lib/pip";
import {
  PROMO_LIMITS,
  REC_INCLUDE,
  canViewRec,
  logPromotion,
  recPermissions,
  validateFiles,
} from "@/app/lib/promotion";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/promotions/recommendations/:id/attachments   body: { companyId, fileName, fileUrl }. DRAFT only (decision 12).
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
      return fail(
        origin,
        "Files can only change while the recommendation is a draft",
        409,
      );
    if (!recPermissions(actor, rec).canAttach)
      return fail(origin, "You cannot change this recommendation", 403);
    const f = validateFiles(
      [{ fileName: body.fileName, fileUrl: body.fileUrl }],
      companyId,
    );
    if ("error" in f) return fail(origin, f.error);

    const bufInfo = await readUploadedBuffer(f.files[0].fileUrl, companyId);
    const file = await prisma.$transaction(async (tx) => {
      if (
        (await tx.promotionAttachment.count({
          where: { recommendationId: id, removedAt: null },
        })) >= PROMO_LIMITS.files
      )
        return null;
      const a = await tx.promotionAttachment.create({
        data: {
          recommendationId: id,
          uploadedBy: staffId,
          fileName: f.files[0].fileName,
          fileUrl: f.files[0].fileUrl,
          mimeType: bufInfo?.mimeType ?? null,
          sizeBytes: bufInfo?.sizeBytes ?? null,
          data: bufInfo?.buffer ? new Uint8Array(bufInfo.buffer) : null,
        },
      });
      await logPromotion(tx, {
        recommendationId: id,
        companyId,
        action: "ATTACHMENT_ADDED",
        actorId: staffId,
        newData: { fileName: a.fileName },
      });
      return a;
    });
    if (!file)
      return fail(
        origin,
        `A recommendation can have at most ${PROMO_LIMITS.files} files`,
        409,
      );
    return ok(
      origin,
      {
        ...file,
        downloadPath: `/api/promotions/recommendations/${id}/attachments/${file.id}/file`,
      },
      "File added",
      201,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
