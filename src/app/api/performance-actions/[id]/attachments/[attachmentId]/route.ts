import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import { resolveActor } from "@/app/lib/manager-review";
import { findManagedAction } from "@/app/lib/performance-action";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/performance-actions/:id/attachments/:attachmentId?companyId=...
// Soft-removes (sets removedAt); the row and the stored file are kept.
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string; attachmentId: string }>,
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

    const { id, attachmentId } = await context.params;
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
    if (!actor.staffRecordId)
      return withCors(
        ApiResponse.error(
          "A staff record is required to remove attachments",
          403,
        ),
        origin,
      );
    const actorId = actor.staffRecordId;

    const action = await findManagedAction(
      id,
      companyId,
      actor.companyWide,
      actorId,
    );
    if (!action)
      return withCors(
        ApiResponse.error("Performance action not found", 404),
        origin,
      );

    const attachment = await prisma.performanceActionAttachment.findFirst({
      where: { id: attachmentId, actionId: id, removedAt: null },
    });
    if (!attachment)
      return withCors(ApiResponse.error("Attachment not found", 404), origin);

    await prisma.$transaction(async (tx) => {
      await tx.performanceActionAttachment.update({
        where: { id: attachmentId },
        data: { removedAt: new Date() },
      });
      await tx.performanceAction.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      await tx.performanceActionHistory.create({
        data: {
          actionId: id,
          companyId,
          action: "ATTACHMENT_REMOVED",
          actorId,
          previousData: { attachmentId, fileName: attachment.fileName },
        },
      });
    });

    return withCors(
      ApiResponse.success(
        { id: attachmentId },
        "Attachment removed successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
