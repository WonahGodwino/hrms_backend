import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  authorize,
  canWrite,
  loadPlan,
  logDevAction,
  nameOf,
} from "@/app/lib/development-plans/dev-utils";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const MAX_BYTES = 10 * 1024 * 1024; // same limit as POST /api/goals/uploads

// POST /api/development-plans/:id/evidence
// body: { companyId, fileName, fileUrl, mimeType?, sizeBytes? }
// Step 2 of the goals-style flow: first POST /api/goals/uploads (multipart) returns
// { fileName, fileUrl }; this records the metadata. fileUrl must be one of this
// company's uploads, so a client cannot attach another company's file path.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  const bad = (m: string) => withCors(ApiResponse.error(m, 400), origin);
  try {
    const { id } = await context.params;
    const body = await request.json();
    const a = await authorize(request, body?.companyId);
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const fileName =
      typeof body.fileName === "string" ? body.fileName.trim() : "";
    const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl.trim() : "";
    if (!fileName || !fileUrl)
      return bad("Missing required fields: fileName, fileUrl");
    if (fileName.length > 255 || fileUrl.length > 500)
      return bad("fileName or fileUrl is too long");
    if (
      !fileUrl.startsWith(`/goal-evidence/${companyId}/`) ||
      fileUrl.includes("..")
    )
      return bad("fileUrl must be a file uploaded for this company");
    let sizeBytes: number | null = null;
    if (body.sizeBytes !== undefined && body.sizeBytes !== null) {
      if (
        !Number.isInteger(body.sizeBytes) ||
        body.sizeBytes < 0 ||
        body.sizeBytes > MAX_BYTES
      )
        return bad("sizeBytes must be an integer up to 10MB");
      sizeBytes = body.sizeBytes;
    }
    const mimeType =
      typeof body.mimeType === "string" && body.mimeType.length <= 100
        ? body.mimeType
        : null;

    const plan = await loadPlan(id, companyId);
    if (!plan || !canWrite(a.auth, plan))
      return withCors(
        ApiResponse.notFound("Development plan not found"),
        origin,
      );

    const bufInfo = await readUploadedBuffer(fileUrl, companyId);
    const finalMime = mimeType || bufInfo?.mimeType || null;
    const finalSize = sizeBytes ?? bufInfo?.sizeBytes ?? null;

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.developmentPlanEvidence.create({
        data: {
          planId: id,
          fileName,
          fileUrl,
          mimeType: finalMime,
          sizeBytes: finalSize,
          data: bufInfo?.buffer ? new Uint8Array(bufInfo.buffer) : null,
          uploadedById: actorId,
        },
        include: {
          uploadedBy: { select: { firstName: true, lastName: true } },
        },
      });
      await logDevAction(tx, {
        planId: id,
        companyId,
        actorId,
        action: "EVIDENCE_ADDED",
        newData: { fileName },
      });
      return created;
    });

    return withCors(
      ApiResponse.success(
        {
          id: row.id,
          name: row.fileName,
          fileUrl: row.fileUrl,
          sizeBytes: row.sizeBytes,
          mimeType: row.mimeType,
          date: row.createdAt,
          uploadedBy: nameOf(row.uploadedBy),
          downloadPath: `/api/development-plans/${id}/evidence/${row.id}/file`,
        },
        "Evidence added successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
