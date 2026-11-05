import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import {
  EMP_LIMITS,
  Params,
  bail,
  employeeWriteCtx,
  guarded,
  intIn,
  ownLivePip,
  parseFiles,
  parseIdList,
  readBody,
  text,
} from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// "Save Draft": overwrites the employee's one draft for this objective
export async function PUT(
  request: NextRequest,
  { params }: Params<{ id: string; objectiveId: string }>,
) {
  const { id, objectiveId } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await employeeWriteCtx(request, body.companyId);
    const progress = intIn(body.progress, "progress");
    const note = text(body.note, "note", EMP_LIMITS.progressNote);
    const completedTaskIds = parseIdList(
      body.completedTaskIds,
      "completedTaskIds",
    );
    const files = parseFiles(body.evidence, ctx.companyId);

    const draft = await prisma.$transaction(async (tx) => {
      await ownLivePip(tx, ctx, id);
      const obj = await tx.pipImprovementObjective.findFirst({
        where: { id: objectiveId, pipId: id, removedAt: null },
        select: { id: true },
      });
      if (!obj) return bail(404, "Objective not found");
      if (completedTaskIds.length) {
        const n = await tx.pipMilestone.count({
          where: {
            id: { in: completedTaskIds },
            pipId: id,
            improvementObjectiveId: objectiveId,
            removedAt: null,
          },
        });
        if (n !== completedTaskIds.length)
          return bail(404, "Task not found on this objective");
      }
      const data = {
        pipId: id,
        progress,
        note,
        completedTaskIds,
        evidence: files as Prisma.InputJsonValue,
      };
      return tx.pipProgressDraft.upsert({
        where: {
          improvementObjectiveId_staffRecordId: {
            improvementObjectiveId: objectiveId,
            staffRecordId: ctx.staffId,
          },
        },
        create: {
          ...data,
          improvementObjectiveId: objectiveId,
          staffRecordId: ctx.staffId,
        },
        update: data,
      });
    });
    return ok(origin, { savedAt: draft.updatedAt }, "Draft saved");
  });
}
