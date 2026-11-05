import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  getStaffRecordIdFromEmail,
  UserContext,
} from "@/app/lib/access-control";
import {
  MAX_EVIDENCE_PER_REFLECTION,
  MAX_SHORT_TEXT,
  RouteContext,
  assertEditable,
  findOwnedAppraisal,
  markPhaseStarted,
} from "@/app/lib/self-appraisal";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/self-appraisals/:id/evidence
// body: { companyId, goalReflectionId, items: [{ sourceType, fileName, fileUrl }] }
// UPLOAD items use the { fileName, fileUrl } returned by POST /api/goals/uploads.
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
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { id } = await context.params;
    const body = await request.json();
    const { companyId, goalReflectionId, items } = body ?? {};
    if (!companyId || typeof companyId !== "string" || !goalReflectionId)
      return withCors(
        ApiResponse.error(
          "Missing required fields: companyId, goalReflectionId",
          400,
        ),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const staffRecordId = await getStaffRecordIdFromEmail(user.email);
    if (!staffRecordId)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const appraisal = await findOwnedAppraisal(id, companyId, staffRecordId);
    if (!appraisal)
      return withCors(
        ApiResponse.error("Self appraisal not found", 404),
        origin,
      );

    const blocked = assertEditable(appraisal);
    if (blocked) return withCors(ApiResponse.error(blocked, 409), origin);

    const reflection = appraisal.goalReflections.find(
      (r) => r.id === goalReflectionId,
    );
    if (!reflection)
      return withCors(
        ApiResponse.error("Goal reflection not found on this appraisal", 404),
        origin,
      );

    if (!Array.isArray(items) || items.length === 0)
      return withCors(
        ApiResponse.error("items must be a non-empty array", 400),
        origin,
      );
    if (reflection.evidence.length + items.length > MAX_EVIDENCE_PER_REFLECTION)
      return withCors(
        ApiResponse.error(
          `A goal can have at most ${MAX_EVIDENCE_PER_REFLECTION} attachments`,
          400,
        ),
        origin,
      );

    const uploadPrefix = `/goal-evidence/${companyId}/`;
    const clean: {
      sourceType: "UPLOAD" | "LINK";
      fileName: string;
      fileUrl: string;
    }[] = [];
    for (const item of items) {
      const sourceType = item?.sourceType;
      const fileName =
        typeof item?.fileName === "string" ? item.fileName.trim() : "";
      const fileUrl =
        typeof item?.fileUrl === "string" ? item.fileUrl.trim() : "";

      if (sourceType !== "UPLOAD" && sourceType !== "LINK")
        return withCors(
          ApiResponse.error("sourceType must be UPLOAD or LINK", 400),
          origin,
        );
      if (!fileName || fileName.length > MAX_SHORT_TEXT)
        return withCors(
          ApiResponse.error(
            `fileName is required (max ${MAX_SHORT_TEXT} characters)`,
            400,
          ),
          origin,
        );

      if (sourceType === "UPLOAD") {
        // Only files this company uploaded through /api/goals/uploads
        if (!fileUrl.startsWith(uploadPrefix) || fileUrl.includes(".."))
          return withCors(
            ApiResponse.error("Invalid fileUrl for an upload", 400),
            origin,
          );
      } else {
        try {
          const u = new URL(fileUrl);
          if (u.protocol !== "http:" && u.protocol !== "https:")
            throw new Error();
        } catch {
          return withCors(
            ApiResponse.error("A link must be a valid http(s) URL", 400),
            origin,
          );
        }
      }
      clean.push({ sourceType, fileName, fileUrl });
    }

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const c of clean) {
        let bufInfo: { buffer: Buffer; mimeType: string; sizeBytes: number } | null = null;
        if (c.sourceType === "UPLOAD") {
          bufInfo = await readUploadedBuffer(c.fileUrl, companyId);
        }
        rows.push(
          await tx.selfAppraisalEvidence.create({
            data: {
              goalReflectionId,
              sourceType: c.sourceType,
              fileName: c.fileName,
              fileUrl: c.fileUrl,
              mimeType: bufInfo?.mimeType ?? null,
              sizeBytes: bufInfo?.sizeBytes ?? null,
              data: bufInfo?.buffer ?? null,
              uploadedBy: staffRecordId,
            },
          }),
        );
      }
      await tx.selfAppraisal.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
      await markPhaseStarted(tx, appraisal.participantId);
      await tx.selfAppraisalHistory.create({
        data: {
          selfAppraisalId: id,
          companyId,
          action: "EVIDENCE_ADDED",
          actorId: staffRecordId,
          newData: {
            goalReflectionId,
            fileNames: clean.map((c) => c.fileName),
          },
        },
      });
      return rows;
    });

    return withCors(
      ApiResponse.success(
        created.map((e) => ({
          id: e.id,
          sourceType: e.sourceType,
          fileName: e.fileName,
          fileUrl: e.fileUrl,
          mimeType: e.mimeType,
          sizeBytes: e.sizeBytes,
          downloadPath:
            e.sourceType === "UPLOAD"
              ? `/api/self-appraisals/evidence/${e.id}/file`
              : undefined,
        })),
        "Evidence attached successfully",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
