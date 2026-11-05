import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  readUploadedBuffer,
  serveBinaryFile,
} from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/pips/evidence/:evidenceId/file
// Supports ?disposition=inline (preview) or ?disposition=attachment (download, default)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ evidenceId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    }
    const user: UserContext = requireRole(authHeader.replace("Bearer ", ""), [
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { evidenceId } = await context.params;
    const evidence = await prisma.pipEvidence.findFirst({
      where: { id: evidenceId, removedAt: null },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        data: true,
        pip: { select: { companyId: true } },
      },
    });

    if (!evidence) {
      return withCors(ApiResponse.notFound("Evidence not found"), origin);
    }

    const companyId = evidence.pip.companyId;
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this file", 403),
        origin,
      );
    }

    let buffer: Buffer | null = null;
    let contentType = evidence.mimeType || "application/octet-stream";

    if (evidence.data && evidence.data.length > 0) {
      buffer = Buffer.from(evidence.data);
    } else if (evidence.fileUrl) {
      const bufInfo = await readUploadedBuffer(evidence.fileUrl, companyId);
      if (bufInfo) {
        buffer = bufInfo.buffer;
        contentType = bufInfo.mimeType;
        prisma.pipEvidence
          .update({
            where: { id: evidence.id },
            data: {
              data: buffer,
              mimeType: contentType,
              sizeBytes: buffer.length,
            },
          })
          .catch((err) => {
            console.warn(
              "Could not backfill pipEvidence binary into database:",
              err,
            );
          });
      }
    }

    if (!buffer) {
      return withCors(ApiResponse.notFound("File binary not found"), origin);
    }

    const dispositionParam = new URL(request.url).searchParams.get(
      "disposition",
    );
    const disposition = dispositionParam === "inline" ? "inline" : "attachment";

    return serveBinaryFile({
      buffer,
      mimeType: contentType,
      fileName: evidence.fileName,
      disposition,
      origin,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
