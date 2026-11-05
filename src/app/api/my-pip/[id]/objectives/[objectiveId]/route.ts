import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { captureKpiSnapshot, logPip, ok } from "@/app/lib/pip";
import {
  EMP_LIMITS,
  Params,
  bail,
  employeeWriteCtx,
  guarded,
  intIn,
  objectiveStatus,
  ownLivePip,
  parseFiles,
  parseIdList,
  readBody,
  text,
} from "@/app/lib/pip-employee";
import { readUploadedBuffer } from "@/app/lib/goals/evidence-files";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// "Submit Update": progress, reflection note, ticked checklist tasks and new evidence in one transaction
export async function PATCH(
  request: NextRequest,
  { params }: Params<{ id: string; objectiveId: string }>,
) {
  const { id, objectiveId } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await employeeWriteCtx(request, body.companyId);
    const progress = intIn(body.progress, "progress");
    const note = text(body.note, "note", EMP_LIMITS.progressNote);
    const taskIds = parseIdList(body.completedTaskIds, "completedTaskIds");
    const files = parseFiles(body.evidence, ctx.companyId);

    const result = await prisma.$transaction(async (tx) => {
      await ownLivePip(tx, ctx, id);
      const obj = await tx.pipImprovementObjective.findFirst({
        where: { id: objectiveId, pipId: id, removedAt: null },
      });
      if (!obj) return bail(404, "Objective not found");

      const tasks = taskIds.length
        ? await tx.pipMilestone.findMany({
            where: {
              id: { in: taskIds },
              pipId: id,
              improvementObjectiveId: objectiveId,
              removedAt: null,
            },
            select: { id: true, status: true },
          })
        : [];
      if (tasks.length !== taskIds.length)
        return bail(404, "Task not found on this objective");
      const toComplete = tasks
        .filter((t) => t.status === "PENDING")
        .map((t) => t.id);

      if (
        progress === obj.progress &&
        !note &&
        !toComplete.length &&
        !files.length
      )
        return bail(400, "Nothing to update");
      if (files.length) {
        const existing = await tx.pipEvidence.count({
          where: { improvementObjectiveId: objectiveId, removedAt: null },
        });
        if (existing + files.length > EMP_LIMITS.evidencePerObjective)
          return bail(
            409,
            `An objective can have at most ${EMP_LIMITS.evidencePerObjective} evidence files`,
          );
      }

      const now = new Date();
      const updated = await tx.pipImprovementObjective.update({
        where: { id: objectiveId },
        data: {
          progress,
          completedAt: progress === 100 ? (obj.completedAt ?? now) : null,
        },
      });
      const upd = await tx.pipProgressUpdate.create({
        data: {
          pipId: id,
          improvementObjectiveId: objectiveId,
          previousProgress: obj.progress,
          progress,
          note,
          createdById: ctx.staffId,
        },
      });
      if (toComplete.length)
        await tx.pipMilestone.updateMany({
          where: { id: { in: toComplete } },
          data: { status: "COMPLETED", completedAt: now },
        });
      if (files.length) {
        for (const f of files) {
          const bufInfo = await readUploadedBuffer(f.fileUrl, ctx.companyId);
          await tx.pipEvidence.create({
            data: {
              pipId: id,
              improvementObjectiveId: objectiveId,
              progressUpdateId: upd.id,
              uploadedById: ctx.staffId,
              fileName: f.fileName,
              fileUrl: f.fileUrl,
              mimeType: bufInfo?.mimeType ?? null,
              sizeBytes: bufInfo?.sizeBytes ?? null,
              data: bufInfo?.buffer ?? null,
            },
          });
        }
      }
      await tx.pipProgressDraft.deleteMany({
        where: {
          improvementObjectiveId: objectiveId,
          staffRecordId: ctx.staffId,
        },
      });

      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "OBJECTIVE_PROGRESS",
        actorId: ctx.staffId,
        previousData: { progress: obj.progress },
        newData: {
          objectiveId,
          progress,
          hasNote: !!note,
          tasksCompleted: toComplete.length,
          evidenceCount: files.length,
        },
      });
      if (toComplete.length)
        await logPip(tx, {
          pipId: id,
          companyId: ctx.companyId,
          action: "MILESTONE_UPDATED",
          actorId: ctx.staffId,
          newData: { taskIds: toComplete, status: "COMPLETED" },
        });
      return {
        updated,
        tasksCompleted: toComplete.length,
        evidenceAdded: files.length,
      };
    });

    if (result.tasksCompleted)
      await captureKpiSnapshot(id, "CHECKPOINT", ctx.staffId); // never throws
    return ok(
      origin,
      {
        id: result.updated.id,
        progress: result.updated.progress,
        status: objectiveStatus(result.updated.progress),
        completedAt: result.updated.completedAt,
        tasksCompleted: result.tasksCompleted,
        evidenceAdded: result.evidenceAdded,
      },
      "Progress updated",
    );
  });
}
