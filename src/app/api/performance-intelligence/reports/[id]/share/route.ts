import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { createHash, randomBytes } from "crypto";
import prisma from "@/app/lib/prisma";
import { RouteContext } from "@/app/lib/self-appraisal";
import {
  authorizeSuper,
  logReportEvent,
} from "@/app/lib/performance-intelligence/intel-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/performance-intelligence/reports/:id/share
// body: { companyId, label?, expiresInDays? (1-30, default 7), maxDownloads? (1-1000) }
// The raw token is returned ONCE; only its hash is stored.
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  const bad = (m: string, s = 400) => withCors(ApiResponse.error(m, s), origin);
  try {
    const { id } = await context.params;
    const body = await request.json();
    const a = await authorizeSuper(request, body?.companyId);
    if (!a.ok) return a.response;
    const { companyId, actorId } = a.auth;

    const days = body.expiresInDays === undefined ? 7 : body.expiresInDays;
    if (!Number.isInteger(days) || days < 1 || days > 30)
      return bad("expiresInDays must be between 1 and 30");
    const max = body.maxDownloads ?? null;
    if (max !== null && (!Number.isInteger(max) || max < 1 || max > 1000))
      return bad("maxDownloads must be between 1 and 1000");
    const label =
      typeof body.label === "string"
        ? body.label.trim().slice(0, 100) || null
        : null;

    const report = await prisma.intelligenceReport.findFirst({
      where: { id, companyId },
    });
    if (!report || report.status !== "READY" || report.purgedAt)
      return withCors(ApiResponse.notFound("Report not available"), origin);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const share = await prisma.intelligenceReportShare.create({
      data: {
        reportId: id,
        companyId,
        label,
        expiresAt,
        maxDownloads: max,
        createdById: actorId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
      },
    });
    await logReportEvent({
      reportId: id,
      companyId,
      action: "SHARE_CREATED",
      actorId,
      shareId: share.id,
    });

    const base = process.env.PUBLIC_API_URL || new URL(request.url).origin;
    return withCors(
      ApiResponse.success(
        {
          shareId: share.id,
          url: `${base}/api/performance-intelligence/shared/${token}`,
          expiresAt,
          maxDownloads: max,
          label,
        },
        "Share link created",
        201,
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}