import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { logPip, ok } from "@/app/lib/pip";
import {
  EMP_LIMITS,
  Params,
  bail,
  employeeWriteCtx,
  guarded,
  ownLivePip,
  parseFiles,
  readBody,
} from "@/app/lib/pip-employee";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// "Uploaded Evidence" in the details drawer: attach already-uploaded files straight to the objective
export async function POST(
  request: NextRequest,
  { params }: Params<{ id: string; objectiveId: string }>,
) {
  const { id, objectiveId } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await employeeWriteCtx(request, body.companyId);
    const files = parseFiles(body.files, ctx.companyId);
    if (!files.length) return bail(400, "At least one file is required");

    const created = await prisma.$transaction(async (tx) => {
      await ownLivePip(tx, ctx, id);
      const obj = await tx.pipImprovementObjective.findFirst({
        where: { id: objectiveId, pipId: id, removedAt: null },
        select: { id: true },
      });
      if (!obj) return bail(404, "Objective not found");
      const existing = await tx.pipEvidence.count({
        where: { improvementObjectiveId: objectiveId, removedAt: null },
      });
      if (existing + files.length > EMP_LIMITS.evidencePerObjective)
        return bail(
          409,
          `An objective can have at most ${EMP_LIMITS.evidencePerObjective} evidence files`,
        );
      const rows = await Promise.all(
        files.map(async (f) => {
          const bufInfo = await readUploadedBuffer(f.fileUrl, ctx.companyId);
          return tx.pipEvidence.create({
            data: {
              pipId: id,
              improvementObjectiveId: objectiveId,
              uploadedById: ctx.staffId,
              fileName: f.fileName,
              fileUrl: f.fileUrl,
              mimeType: bufInfo?.mimeType ?? null,
              sizeBytes: bufInfo?.sizeBytes ?? null,
              data: bufInfo?.buffer ? new Uint8Array(bufInfo.buffer) : null,
            },
          });
        }),
      );
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "EVIDENCE_ADDED",
        actorId: ctx.staffId,
        newData: { objectiveId, files: files.map((f) => f.fileName) },
      });
      return rows;
    });
    return ok(
      origin,
      created.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        fileUrl: e.fileUrl,
        mimeType: e.mimeType,
        sizeBytes: e.sizeBytes,
        createdAt: e.createdAt,
        downloadPath: `/api/pips/evidence/${e.id}/file`,
      })),
      "Evidence uploaded",
      201,
    );
  });
}
