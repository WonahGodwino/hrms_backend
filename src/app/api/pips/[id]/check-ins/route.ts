import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  logPip,
  ok,
  pipScope,
  readCtx,
  startOfUtcDay,
  writeCtx,
} from "@/app/lib/pip";
import {
  EMP_LIMITS,
  Params,
  bail,
  dateOnly,
  guarded,
  intIn,
  managedPip,
  mondayOf,
  readBody,
  recoveryOf,
  text,
} from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const r = await readCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    if (!r.ok) return r.response;
    const pip = await prisma.pip.findFirst({
      where: { id, companyId: r.ctx.companyId, ...pipScope(r.ctx.actor) },
      select: { id: true },
    });
    if (!pip) return bail(404, "PIP not found");
    return ok(
      origin,
      await prisma.pipWeeklyCheckIn.findMany({
        where: { pipId: id },
        orderBy: { weekStart: "asc" },
      }),
    );
  });
}

// Record (or overwrite) one week's metrics; recoveryScore is frozen at this moment
export async function PUT(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const r = await writeCtx(request, body.companyId);
    if (!r.ok) return r.response;
    const ctx = r.ctx;
    const productivityScore = intIn(
      body.productivityScore,
      "productivityScore",
    );
    const qualityScore = intIn(body.qualityScore, "qualityScore");
    const note = text(body.note, "note", EMP_LIMITS.checkInNote);
    const weekStart = mondayOf(
      body.weekStart ? dateOnly(body.weekStart, "weekStart") : startOfUtcDay(),
    );

    const row = await prisma.$transaction(async (tx) => {
      const pip = await managedPip(tx, ctx, id, "live");
      if (weekStart > startOfUtcDay())
        return bail(400, "You can't record a future week");
      if (weekStart < mondayOf(pip.startDate))
        return bail(400, "That week is before the plan started");
      const [objs, ms] = await Promise.all([
        tx.pipImprovementObjective.findMany({
          where: { pipId: id, removedAt: null },
          select: { severity: true, progress: true },
        }),
        tx.pipMilestone.findMany({
          where: { pipId: id, removedAt: null },
          select: { status: true },
        }),
      ]);
      const data = {
        productivityScore,
        qualityScore,
        recoveryScore: recoveryOf(objs, ms),
        note,
        recordedById: ctx.staffId,
      };
      const c = await tx.pipWeeklyCheckIn.upsert({
        where: { pipId_weekStart: { pipId: id, weekStart } },
        create: { pipId: id, weekStart, ...data },
        update: data,
      });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "WEEKLY_CHECKIN_RECORDED",
        actorId: ctx.staffId,
        newData: {
          weekStart: weekStart.toISOString().slice(0, 10),
          productivityScore,
          qualityScore,
        },
      });
      return c;
    });
    return ok(origin, row, "Check-in saved");
  });
}
