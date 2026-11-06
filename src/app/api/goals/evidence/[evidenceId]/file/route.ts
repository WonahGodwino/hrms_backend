import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { prisma } from "@/app/lib/db";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  ALL_ROLES,
  loadGoal,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import { HttpError } from "@/app/lib/goals/goal-utils";
import {
  CONTENT_TYPES,
  evidenceDiskPath,
  parseEvidenceUrl,
} from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/goals/evidence/:evidenceId/file
// Supports ?disposition=inline (browser preview) or ?disposition=attachment (download, default)
export const GET = withGoalAuth<{ evidenceId: string }>(
  ALL_ROLES,
  async ({ request, user, params, origin }) => {
    const evidence = await prisma.goalEvidence.findUnique({
      where: { id: params.evidenceId },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        mimeType: true,
        sizeBytes: true,
        data: true,
        goal: { select: { id: true, companyId: true } },
      },
    });

    if (
      !evidence ||
      !(await verifyCompanyAccess(user, evidence.goal.companyId))
    ) {
      throw new HttpError(404, "File not found");
    }

    const actor = await resolveGoalActor(user, evidence.goal.companyId);
    await loadGoal(evidence.goal.id, actor, "view", "File");

    let buffer: Buffer | null = null;
    let contentType = evidence.mimeType || "application/octet-stream";

    // 1. Direct PostgreSQL bytea storage (replicates CandidateFile approach)
    if (evidence.data && evidence.data.length > 0) {
      buffer = Buffer.from(evidence.data);
    } else if (evidence.fileUrl) {
      // 2. Fallback to local disk storage for legacy or pre-migration records
      const parsed = parseEvidenceUrl(evidence.fileUrl);
      if (parsed && parsed.companyId === evidence.goal.companyId) {
        try {
          buffer = await readFile(
            evidenceDiskPath(parsed.companyId, parsed.storedName),
          );
          if (parsed.ext && CONTENT_TYPES[parsed.ext]) {
            contentType = CONTENT_TYPES[parsed.ext];
          }
          // Opportunistically backfill binary into PostgreSQL so future reads are pure DB queries
          prisma.goalEvidence
            .update({
              where: { id: evidence.id },
              data: {
                data: new Uint8Array(buffer),
                mimeType: contentType,
                sizeBytes: buffer.length,
              },
            })
            .catch((err) => {
              console.warn("Could not backfill goal evidence binary into database:", err);
            });
        } catch {
          // File not found on disk
        }
      }
    }

    if (!buffer) {
      throw new HttpError(404, "File not found");
    }

    const dispositionParam = new URL(request.url).searchParams.get("disposition");
    const disposition = dispositionParam === "inline" ? "inline" : "attachment";
    const ascii = evidence.fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");

    return withCors(
      new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(buffer.length),
          "Content-Disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(evidence.fileName)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      }),
      origin,
    );
  },
);
