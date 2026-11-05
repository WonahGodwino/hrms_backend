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
  oneOf,
  ownLivePip,
  readBody,
  text,
} from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// "Add Reflection" on a timeline milestone or coaching session (never overwrites the description)
export async function POST(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await employeeWriteCtx(request, body.companyId);
    const kind = oneOf(body.kind, ["MILESTONE", "SESSION"] as const, "kind");
    const targetId = text(body.targetId, "targetId", 64, {
      required: true,
    }) as string;
    const reflection = text(
      body.reflection,
      "reflection",
      EMP_LIMITS.reflection,
      { required: true },
    ) as string;

    await prisma.$transaction(async (tx) => {
      await ownLivePip(tx, ctx, id);
      const data = { employeeReflection: reflection, reflectionAt: new Date() };
      if (kind === "MILESTONE") {
        const m = await tx.pipMilestone.findFirst({
          where: { id: targetId, pipId: id, removedAt: null },
          select: { id: true },
        });
        if (!m) return bail(404, "Milestone not found");
        await tx.pipMilestone.update({ where: { id: targetId }, data });
      } else {
        const s = await tx.pipCoachingSession.findFirst({
          where: { id: targetId, pipId: id, status: { not: "CANCELLED" } },
          select: { id: true },
        });
        if (!s) return bail(404, "Session not found");
        await tx.pipCoachingSession.update({ where: { id: targetId }, data });
      }
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "REFLECTION_SAVED",
        actorId: ctx.staffId,
        newData: { kind, targetId },
      });
    });
    return ok(origin, { saved: true }, "Reflection saved");
  });
}
