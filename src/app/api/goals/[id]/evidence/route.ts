import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  ALL_ROLES,
  assertCompanyAccess,
  loadGoal,
  requireActorId,
  resolveGoalActor,
  withGoalAuth,
} from "@/app/lib/goals/goal-access";
import {
  GOAL_HISTORY_ACTIONS,
  HttpError,
  logGoalAction,
  parseText,
} from "@/app/lib/goals/goal-utils";
import {
  assertUploadedFile,
  sanitizeFileName,
  readUploadedBuffer,
} from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/goals/:id/evidence
// body: { companyId, fileName, fileUrl, note?, progressUpdateId? }
// fileUrl must be the value returned by POST /api/goals/uploads for this company.
export const POST = withGoalAuth<{ id: string }>(
  ALL_ROLES,
  async ({ request, user, params, ok }) => {
    const body = await request.json();
    const companyId = await assertCompanyAccess(user, body?.companyId);
    const fileName = sanitizeFileName(body.fileName);
    const note = parseText(body.note, "note", { max: 1000 });
    const fileUrl = await assertUploadedFile(body.fileUrl, companyId);
    const actor = await resolveGoalActor(user, companyId);
    const actorId = requireActorId(actor);
    const { goal } = await loadGoal(params.id, actor, "write");
    if (goal.isArchived)
      throw new HttpError(409, "Cannot add evidence to an archived goal");

    if (
      await prisma.goalEvidence.findFirst({
        where: { fileUrl },
        select: { id: true },
      })
    )
      throw new HttpError(409, "This file is already attached to a goal");

    let progressUpdateId: string | null = null;
    if (body.progressUpdateId) {
      const update = await prisma.goalProgressUpdate.findFirst({
        where: { id: String(body.progressUpdateId), goalId: goal.id },
        select: { id: true },
      });
      if (!update)
        throw new HttpError(
          400,
          "progressUpdateId does not belong to this goal",
        );
      progressUpdateId = update.id;
    }

    const bufInfo = await readUploadedBuffer(fileUrl, companyId);
    const buffer: Buffer | null = bufInfo ? bufInfo.buffer : null;
    const mimeType: string | null = bufInfo ? bufInfo.mimeType : null;

    const evidence = await prisma.$transaction(async (tx) => {
      const created = await tx.goalEvidence.create({
        data: {
          goalId: goal.id,
          progressUpdateId,
          fileName,
          fileUrl,
          mimeType,
          sizeBytes: buffer ? buffer.length : null,
          data: buffer ? new Uint8Array(buffer) : null,
          note,
          uploadedBy: actorId,
        },
      });
      await logGoalAction(tx, {
        goalId: goal.id,
        companyId,
        action: GOAL_HISTORY_ACTIONS.EVIDENCE_UPLOADED,
        actorId,
        newData: { fileName },
      });
      return created;
    });
    const { fileUrl: _omit, data: _omitData, ...safe } = evidence;
    return ok(
      { ...safe, downloadPath: `/api/goals/evidence/${evidence.id}/file` },
      "Evidence uploaded successfully",
      201,
    );
  },
);
