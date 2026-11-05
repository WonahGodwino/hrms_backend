import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import prisma from "@/app/lib/prisma";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  authorizeSuper,
  logReportEvent,
} from "@/app/lib/performance-intelligence/intel-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/performance-intelligence/reports/:id/share/:shareId?companyId  (soft revoke)
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string; shareId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id, shareId } = await context.params;
    const { searchParams } = new URL(request.url);
    const a = await authorizeSuper(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const flipped = await prisma.intelligenceReportShare.updateMany({
      where: { id: shareId, reportId: id, companyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actorId },
    });
    if (flipped.count !== 1)
      return withCors(
        ApiResponse.notFound("Share link not found or already revoked"),
        origin,
      );
    await logReportEvent({
      reportId: id,
      companyId,
      action: "SHARE_REVOKED",
      actorId,
      shareId,
    });
    return withCors(
      ApiResponse.success({ shareId }, "Share link revoked"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}