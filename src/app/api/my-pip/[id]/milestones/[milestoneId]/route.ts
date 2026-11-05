import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { captureKpiSnapshot, logPip, ok } from "@/app/lib/pip";
import {
  Params,
  bail,
  employeeWriteCtx,
  guarded,
  ownLivePip,
  readBody,
  text,
} from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// The employee can complete their own tasks (milestones attached to an objective), nothing else
export async function PATCH(
  request: NextRequest,
  { params }: Params<{ id: string; milestoneId: string }>,
) {
  const { id, milestoneId } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await employeeWriteCtx(request, body.companyId);
    if (body.status !== "COMPLETED")
      return bail(403, "You can only mark a task as completed");
    const completionNote = text(body.completionNote, "completionNote", 1000);

    const updated = await prisma.$transaction(async (tx) => {
      await ownLivePip(tx, ctx, id);
      const m = await tx.pipMilestone.findFirst({
        where: { id: milestoneId, pipId: id, removedAt: null },
      });
      if (!m) return bail(404, "Task not found");
      if (!m.improvementObjectiveId)
        return bail(403, "Only your manager can update this milestone");
      if (m.status === "COMPLETED")
        return bail(409, "This task is already completed");
      const u = await tx.pipMilestone.update({
        where: { id: milestoneId },
        data: { status: "COMPLETED", completedAt: new Date(), completionNote },
      });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "MILESTONE_UPDATED",
        actorId: ctx.staffId,
        previousData: { status: m.status },
        newData: { milestoneId, status: "COMPLETED" },
      });
      return u;
    });
    await captureKpiSnapshot(id, "CHECKPOINT", ctx.staffId); // never throws; match your manager milestone route
    return ok(
      origin,
      {
        id: updated.id,
        status: updated.status,
        completedAt: updated.completedAt,
      },
      "Task completed",
    );
  });
}
