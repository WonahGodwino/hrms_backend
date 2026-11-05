import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { authorize, loadPlan } from "@/app/lib/development-plans/dev-utils";
import {
  readUploadedBuffer,
  serveBinaryFile,
} from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/development-plans/:id/evidence/:evidenceId/file
// Supports ?disposition=inline (preview) or ?disposition=attachment (download, default)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string; evidenceId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, evidenceId } = await context.params;
    const { searchParams } = new URL(request.url);
    const a = await authorize(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId } = a.auth;

    const plan = await loadPlan(id, companyId);
    if (!plan) {
      return withCors(
        ApiResponse.notFound("Development plan not found"),
        origin,
      );
    }

    const ev = await prisma.developmentPlanEvidence.findFirst({
      where: { id: evidenceId, planId: id, isArchived: false },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        data: true,
      },
    });

    if (!ev) {
      return withCors(ApiResponse.notFound("Evidence not found"), origin);
    }

    let buffer: Buffer | null = null;
    let contentType = ev.mimeType || "application/octet-stream";

    if (ev.data && ev.data.length > 0) {
      buffer = Buffer.from(ev.data);
    } else if (ev.fileUrl) {
      // Fallback for legacy disk-stored files
      const bufInfo = await readUploadedBuffer(ev.fileUrl, companyId);
      if (bufInfo) {
        buffer = bufInfo.buffer;
        contentType = bufInfo.mimeType;
        prisma.developmentPlanEvidence
          .update({
            where: { id: ev.id },
            data: {
              data: buffer,
              mimeType: contentType,
              sizeBytes: buffer.length,
            },
          })
          .catch((err) => {
            console.warn(
              "Could not backfill developmentPlanEvidence binary into database:",
              err,
            );
          });
      }
    }

    if (!buffer) {
      return withCors(ApiResponse.notFound("File binary not found"), origin);
    }

    const dispositionParam = searchParams.get("disposition");
    const disposition = dispositionParam === "inline" ? "inline" : "attachment";

    return serveBinaryFile({
      buffer,
      mimeType: contentType,
      fileName: ev.fileName,
      disposition,
      origin,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
