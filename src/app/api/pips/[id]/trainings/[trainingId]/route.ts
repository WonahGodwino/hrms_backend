import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { logPip, ok, writeCtx } from "@/app/lib/pip";
import {
  EMP_LIMITS,
  Params,
  bail,
  dateOnly,
  guarded,
  managedPip,
  oneOf,
  readBody,
  text,
} from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function PATCH(
  request: NextRequest,
  { params }: Params<{ id: string; trainingId: string }>,
) {
  const { id, trainingId } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const r = await writeCtx(request, body.companyId);
    if (!r.ok) return r.response;
    const ctx = r.ctx;

    const data: Record<string, unknown> = {};
    if (body.remove === true) data.removedAt = new Date();
    else {
      if (body.title !== undefined)
        data.title = text(body.title, "title", EMP_LIMITS.trainingTitle, {
          required: true,
        });
      if (body.dueDate !== undefined)
        data.dueDate = body.dueDate ? dateOnly(body.dueDate, "dueDate") : null;
      if (body.status !== undefined) {
        const status = oneOf(
          body.status,
          ["PENDING", "COMPLETED"] as const,
          "status",
        );
        data.status = status;
        data.completedAt = status === "COMPLETED" ? new Date() : null;
      }
    }
    if (!Object.keys(data).length) return bail(400, "Nothing to update");

    const updated = await prisma.$transaction(async (tx) => {
      await managedPip(tx, ctx, id, "open");
      const t = await tx.pipTraining.findFirst({
        where: { id: trainingId, pipId: id, removedAt: null },
      });
      if (!t) return bail(404, "Training not found");
      const u = await tx.pipTraining.update({
        where: { id: trainingId },
        data,
      });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "TRAINING_UPDATED",
        actorId: ctx.staffId,
        previousData: JSON.parse(
          JSON.stringify(
            Object.fromEntries(
              Object.keys(data).map((k) => [k, (t as any)[k]]),
            ),
          ),
        ),
        newData: JSON.parse(JSON.stringify(data)),
      });
      return u;
    });
    return ok(origin, updated, "Training updated");
  });
}
