import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { logPip, ok, readCtx, writeCtx, pipScope } from "@/app/lib/pip";
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
      where: {
        id,
        companyId: r.ctx.companyId,
        ...pipScope(r.ctx.actor),
      },
      select: { id: true },
    });
    if (!pip) return bail(404, "PIP not found");
    const objectives = await prisma.pipImprovementObjective.findMany({
      where: { pipId: id, removedAt: null },
      orderBy: { displayOrder: "asc" },
    });
    return ok(
      origin,
      objectives.map((o) => ({ ...o, status: objectiveStatus(o.progress) })),
    );
  });
}

export async function POST(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const r = await writeCtx(request, body.companyId);
    if (!r.ok) return r.response;
    const ctx = r.ctx;

    const data = {
      title: text(body.title, "title", EMP_LIMITS.objectiveTitle, {
        required: true,
      }) as string,
      competency: text(
        body.competency,
        "competency",
        EMP_LIMITS.objectiveField,
      ),
      kpi: text(body.kpi, "kpi", EMP_LIMITS.objectiveField),
      baseline: text(body.baseline, "baseline", EMP_LIMITS.objectiveValue),
      target: text(body.target, "target", EMP_LIMITS.objectiveValue),
      severity:
        body.severity === undefined
          ? ("MEDIUM" as const)
          : oneOf(body.severity, SEVERITIES, "severity"),
      dueDate: body.dueDate ? dateOnly(body.dueDate, "dueDate") : null,
      expectations: text(
        body.expectations,
        "expectations",
        EMP_LIMITS.expectations,
      ),
    };

    const created = await prisma.$transaction(async (tx) => {
      await managedPip(tx, ctx, id, "open");
      const count = await tx.pipImprovementObjective.count({
        where: { pipId: id, removedAt: null },
      });
      if (count >= EMP_LIMITS.objectives)
        return bail(
          409,
          `A plan can have at most ${EMP_LIMITS.objectives} objectives`,
        );
      const last = await tx.pipImprovementObjective.aggregate({
        where: { pipId: id },
        _max: { displayOrder: true },
      });
      const obj = await tx.pipImprovementObjective.create({
        data: {
          pipId: id,
          ...data,
          displayOrder: (last._max.displayOrder ?? 0) + 1,
        },
      });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "OBJECTIVE_ADDED",
        actorId: ctx.staffId,
        newData: {
          objectiveId: obj.id,
          title: obj.title,
          severity: obj.severity,
        },
      });
      return obj;
    });
    return ok(origin, created, "Objective added", 201);
  });
}
