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

// GET /api/recognitions/:id/attachment/file
// Supports ?disposition=inline (preview) or ?disposition=attachment (download, default)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
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

    const { id } = await context.params;
    const recognition = await prisma.recognition.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        attachmentName: true,
        attachmentUrl: true,
        attachmentMime: true,
        attachmentSize: true,
        attachmentData: true,
      },
    });

    if (!recognition || !recognition.attachmentName) {
      return withCors(ApiResponse.notFound("Attachment not found"), origin);
    }

    const hasAccess = await verifyCompanyAccess(user, recognition.companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this file", 403),
        origin,
      );
    }

    let buffer: Buffer | null = null;
    let contentType =
      recognition.attachmentMime || "application/octet-stream";

    if (recognition.attachmentData && recognition.attachmentData.length > 0) {
      buffer = Buffer.from(recognition.attachmentData);
    } else if (recognition.attachmentUrl) {
      const bufInfo = await readUploadedBuffer(
        recognition.attachmentUrl,
        recognition.companyId,
      );
      if (bufInfo) {
        buffer = bufInfo.buffer;
        contentType = bufInfo.mimeType;
        prisma.recognition
          .update({
            where: { id: recognition.id },
            data: {
              attachmentData: new Uint8Array(buffer),
              attachmentMime: contentType,
              attachmentSize: buffer.length,
            },
          })
          .catch((err) => {
            console.warn(
              "Could not backfill recognition binary into database:",
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
      fileName: recognition.attachmentName,
      disposition,
      origin,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
