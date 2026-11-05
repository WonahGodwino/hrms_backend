import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { logPip, ok, writeCtx } from "@/app/lib/pip";
import {
  EMP_LIMITS,
  Params,
  SEVERITIES,
  bail,
  dateOnly,
  guarded,
  managedPip,
  objectiveStatus,
  oneOf,
  readBody,
  text,
} from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// Edit fields or soft-remove (progress is the employee's to set)
export async function PATCH(
  request: NextRequest,
  { params }: Params<{ id: string; objectiveId: string }>,
) {
  const { id, objectiveId } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const r = await writeCtx(request, body.companyId);
    if (!r.ok) return r.response;
    const ctx = r.ctx;

    const data: Record<string, unknown> = {};
    if (body.remove === true) data.removedAt = new Date();
    else {
      if (body.title !== undefined)
        data.title = text(body.title, "title", EMP_LIMITS.objectiveTitle, {
          required: true,
        });
      if (body.competency !== undefined)
        data.competency = text(
          body.competency,
          "competency",
          EMP_LIMITS.objectiveField,
        );
      if (body.kpi !== undefined)
        data.kpi = text(body.kpi, "kpi", EMP_LIMITS.objectiveField);
      if (body.baseline !== undefined)
        data.baseline = text(
          body.baseline,
          "baseline",
          EMP_LIMITS.objectiveValue,
        );
      if (body.target !== undefined)
        data.target = text(body.target, "target", EMP_LIMITS.objectiveValue);
      if (body.severity !== undefined)
        data.severity = oneOf(body.severity, SEVERITIES, "severity");
      if (body.dueDate !== undefined)
        data.dueDate = body.dueDate ? dateOnly(body.dueDate, "dueDate") : null;
      if (body.expectations !== undefined)
        data.expectations = text(
          body.expectations,
          "expectations",
          EMP_LIMITS.expectations,
        );
    }
    if (!Object.keys(data).length) return bail(400, "Nothing to update");

    const updated = await prisma.$transaction(async (tx) => {
      await managedPip(tx, ctx, id, "open");
      const obj = await tx.pipImprovementObjective.findFirst({
        where: { id: objectiveId, pipId: id, removedAt: null },
      });
      if (!obj) return bail(404, "Objective not found");
      const u = await tx.pipImprovementObjective.update({
        where: { id: objectiveId },
        data,
      });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action:
          body.remove === true ? "OBJECTIVE_REMOVED" : "OBJECTIVE_UPDATED",
        actorId: ctx.staffId,
        previousData: JSON.parse(
          JSON.stringify(
            Object.fromEntries(
              Object.keys(data).map((k) => [k, (obj as any)[k]]),
            ),
          ),
        ),
        newData: JSON.parse(JSON.stringify(data)),
      });
      return u;
    });
    return ok(
      origin,
      { ...updated, status: objectiveStatus(updated.progress) },
      "Objective updated",
    );
  });
}
