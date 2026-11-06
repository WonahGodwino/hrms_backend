import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import { resolveActor } from "@/app/lib/manager-review";
import {
  MAX_ACTION_ATTACHMENTS,
  findManagedAction,
} from "@/app/lib/performance-action";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/performance-actions/:id/attachments
// body: { companyId, items: [{ fileName, fileUrl }] }
// Upload first via POST /api/goals/uploads, then pass the returned { fileName, fileUrl }.
// Allowed in any status, so files can be added right after "Assign Action".
export async function POST(
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
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { id } = await context.params;
    const body = await request.json();
    const { companyId, items } = body ?? {};
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
        ApiResponse.error("A staff record is required to attach files", 403),
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

    if (!Array.isArray(items) || items.length === 0)
      return withCors(
        ApiResponse.error("items must be a non-empty array", 400),
        origin,
      );
    if (action.attachments.length + items.length > MAX_ACTION_ATTACHMENTS)
      return withCors(
        ApiResponse.error(
          `An action can have at most ${MAX_ACTION_ATTACHMENTS} attachments`,
          400,
        ),
        origin,
      );

    const uploadPrefix = `/goal-evidence/${companyId}/`;
    const clean: { fileName: string; fileUrl: string }[] = [];
    for (const item of items) {
      const fileName =
        typeof item?.fileName === "string" ? item.fileName.trim() : "";
      const fileUrl =
        typeof item?.fileUrl === "string" ? item.fileUrl.trim() : "";
      if (!fileName || fileName.length > 255)
        return withCors(
          ApiResponse.error("fileName is required (max 255 characters)", 400),
          origin,
        );
      // Only files this company uploaded through /api/goals/uploads
      if (!fileUrl.startsWith(uploadPrefix) || fileUrl.includes(".."))
        return withCors(ApiResponse.error("Invalid fileUrl", 400), origin);
      clean.push({ fileName, fileUrl });
    }

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const c of clean) {
        const bufInfo = await readUploadedBuffer(c.fileUrl, companyId);
        rows.push(
          await tx.performanceActionAttachment.create({
            data: {
              actionId: id,
              fileName: c.fileName,
              fileUrl: c.fileUrl,
              mimeType: bufInfo?.mimeType ?? null,
              sizeBytes: bufInfo?.sizeBytes ?? null,
              data: bufInfo?.buffer ? new Uint8Array(bufInfo.buffer) : null,
              uploadedBy: actorId,
            },
          }),
        );
      }
      await tx.performanceAction.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      await tx.performanceActionHistory.create({
        data: {
          actionId: id,
          companyId,
          action: "ATTACHMENT_ADDED",
          actorId,
          newData: { fileNames: clean.map((c) => c.fileName) },
        },
      });
      return rows;
    });

    return withCors(
      ApiResponse.success(
        created.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          downloadPath: `/api/performance-actions/${id}/attachments/${a.id}/file`,
        })),
        "Attachments added successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
