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

// GET /api/performance-actions/:id/attachments/:attachmentId/file
// Supports ?disposition=inline (preview) or ?disposition=attachment (download, default)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string; attachmentId: string }>,
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

    const { id, attachmentId } = await context.params;
    const attachment = await prisma.performanceActionAttachment.findFirst({
      where: { id: attachmentId, actionId: id, removedAt: null },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        data: true,
        action: { select: { companyId: true } },
      },
    });

    if (!attachment) {
      return withCors(ApiResponse.notFound("Attachment not found"), origin);
    }

    const companyId = attachment.action.companyId;
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this file", 403),
        origin,
      );
    }

    let buffer: Buffer | null = null;
    let contentType = attachment.mimeType || "application/octet-stream";

    if (attachment.data && attachment.data.length > 0) {
      buffer = Buffer.from(attachment.data);
    } else if (attachment.fileUrl) {
      const bufInfo = await readUploadedBuffer(attachment.fileUrl, companyId);
      if (bufInfo) {
        buffer = bufInfo.buffer;
        contentType = bufInfo.mimeType;
        prisma.performanceActionAttachment
          .update({
            where: { id: attachment.id },
            data: {
              data: buffer,
              mimeType: contentType,
              sizeBytes: buffer.length,
            },
          })
          .catch((err) => {
            console.warn(
              "Could not backfill performanceActionAttachment binary into database:",
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
      fileName: attachment.fileName,
      disposition,
      origin,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
