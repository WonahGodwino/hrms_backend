import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { RouteContext } from "@/app/lib/self-appraisal";
import { readUploadFile } from "@/app/lib/storage/upload-files";
import {
  logReportEvent,
  reportFilePath,
} from "@/app/lib/performance-intelligence/intel-utils";
import { getTrustedClientIp } from "@/app/lib/security/client-ip";

// GET /api/performance-intelligence/shared/:token
// Unauthenticated download of one frozen report. Every refusal looks the same (404)
// so it never reveals whether a token exists. Each attempt is logged.
export async function GET(
  request: NextRequest,
  context: RouteContext<{ token: string }>,
) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return notFound();
    const share = await prisma.intelligenceReportShare.findUnique({
      where: { tokenHash: createHash("sha256").update(token).digest("hex") },
      include: { report: true },
    });
    if (!share) return notFound();
    const ip =
      getTrustedClientIp(request.headers) || null;
    const now = new Date();
    const deny = async (reason: string) => {
      await logReportEvent({
        reportId: share.reportId,
        companyId: share.companyId,
        action: "SHARE_DENIED",
        shareId: share.id,
        ipAddress: ip,
        metadata: { reason },
      });
      return notFound();
    };

    const r = share.report;
    if (share.revokedAt) return deny("revoked");
    if (share.expiresAt <= now) return deny("expired");
    if (r.status !== "READY" || r.purgedAt || !r.storagePath)
      return deny("unavailable");

    // Atomic: enforces the download cap even under concurrent requests
    const claimed = await prisma.intelligenceReportShare.updateMany({
      where: {
        id: share.id,
        revokedAt: null,
        expiresAt: { gt: now },
        ...(share.maxDownloads
          ? { downloadCount: { lt: share.maxDownloads } }
          : {}),
      },
      data: { downloadCount: { increment: 1 }, lastAccessedAt: now },
    });
    if (claimed.count !== 1) return deny("limit reached");

    let file: Uint8Array<ArrayBuffer> | null;
    try {
      file = await readUploadFile(r.storagePath, reportFilePath(r.storagePath));
    } catch {
      return deny("file missing");
    }
    if (!file) return deny("file missing");
    await logReportEvent({
      reportId: r.id,
      companyId: share.companyId,
      action: "SHARE_DOWNLOADED",
      shareId: share.id,
      ipAddress: ip,
    });
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${r.fileName ?? "report.pdf"}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return notFound();
  }
}