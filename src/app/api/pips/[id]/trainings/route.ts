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
  readBody,
  text,
} from "@/app/lib/pip-employee";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
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
    let title = text(body.title, "title", EMP_LIMITS.trainingTitle);
    const dueDate = body.dueDate ? dateOnly(body.dueDate, "dueDate") : null;

    const created = await prisma.$transaction(async (tx) => {
      await managedPip(tx, ctx, id, "live");
      let trainingProgramId: string | null = null;
      let certificationTypeId: string | null = null;
      if (body.trainingProgramId) {
        const p = await tx.trainingProgram.findFirst({
          where: {
            id: String(body.trainingProgramId),
            companyId: ctx.companyId,
            deletedAt: null,
          },
          select: { id: true, programName: true },
        });
        if (!p) return bail(404, "Training program not found");
        trainingProgramId = p.id;
        title = title ?? p.programName;
      }
      if (body.certificationTypeId) {
        const c = await tx.certificationType.findFirst({
          where: {
            id: String(body.certificationTypeId),
            companyId: ctx.companyId,
            isActive: true,
          },
          select: { id: true, name: true },
        });
        if (!c) return bail(404, "Certification type not found");
        certificationTypeId = c.id;
        title = title ?? c.name;
      }
      if (!title) return bail(400, "title is required");
      let improvementObjectiveId: string | null = null;
      if (body.improvementObjectiveId) {
        const o = await tx.pipImprovementObjective.findFirst({
          where: {
            id: String(body.improvementObjectiveId),
            pipId: id,
            removedAt: null,
          },
          select: { id: true },
        });
        if (!o) return bail(404, "Objective not found on this plan");
        improvementObjectiveId = o.id;
      }
      const t = await tx.pipTraining.create({
        data: {
          pipId: id,
          title,
          trainingProgramId,
          certificationTypeId,
          improvementObjectiveId,
          dueDate,
          assignedById: ctx.staffId,
        },
      });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "TRAINING_ASSIGNED",
        actorId: ctx.staffId,
        newData: { trainingId: t.id, title: t.title },
      });
      return t;
    });
    return ok(origin, created, "Training assigned", 201);
  });
}
