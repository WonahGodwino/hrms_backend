import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { RouteContext } from "@/app/lib/self-appraisal";
import { readUploadFile } from "@/app/lib/storage/upload-files";
import {
  authorizeSuper,
  logReportEvent,
  reportFilePath,
} from "@/app/lib/performance-intelligence/intel-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/performance-intelligence/reports/:id/download?companyId
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const a = await authorizeSuper(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const report = await prisma.intelligenceReport.findFirst({
      where: { id, companyId },
    });
    if (
      !report ||
      report.status !== "READY" ||
      report.purgedAt ||
      !report.storagePath
    )
      return withCors(ApiResponse.notFound("Report not available"), origin);

    const bytes = await readUploadFile(report.storagePath, reportFilePath(report.storagePath));
    if (!bytes) return withCors(ApiResponse.notFound("Report not available"), origin);
    await logReportEvent({
      reportId: id,
      companyId,
      action: "DOWNLOADED",
      actorId,
    });
    return withCors(
      new NextResponse(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${report.fileName ?? "report.pdf"}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        },
      }),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}