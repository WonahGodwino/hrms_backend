import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { logPip, ok } from "@/app/lib/pip";
import {
  EMP_LIMITS,
  Params,
  SUPPORT_SCHEDULES,
  SUPPORT_TYPES,
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

export async function POST(
  request: NextRequest,
  { params }: Params<{ id: string }>,
) {
  const { id } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await employeeWriteCtx(request, body.companyId);
    const type = oneOf(body.type, SUPPORT_TYPES, "type");
    const preferredSchedule =
      body.preferredSchedule === undefined
        ? "THIS_WEEK"
        : oneOf(body.preferredSchedule, SUPPORT_SCHEDULES, "preferredSchedule");
    const message = text(body.message, "message", EMP_LIMITS.supportMessage, {
      required: true,
    }) as string;
    const objectiveId =
      typeof body.improvementObjectiveId === "string" &&
      body.improvementObjectiveId
        ? body.improvementObjectiveId
        : null;

    const created = await prisma.$transaction(async (tx) => {
      await ownLivePip(tx, ctx, id);
      if (objectiveId) {
        const o = await tx.pipImprovementObjective.findFirst({
          where: { id: objectiveId, pipId: id, removedAt: null },
          select: { id: true },
        });
        if (!o) return bail(404, "Objective not found on this plan");
      }
      const open = await tx.pipSupportRequest.count({
        where: { pipId: id, status: "OPEN" },
      });
      if (open >= EMP_LIMITS.openSupportRequests)
        return bail(
          409,
          `You already have ${open} open support requests. Wait for a response first`,
        );
      const r = await tx.pipSupportRequest.create({
        data: {
          pipId: id,
          staffRecordId: ctx.staffId,
          type,
          preferredSchedule,
          message,
          improvementObjectiveId: objectiveId,
        },
      });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "SUPPORT_REQUESTED",
        actorId: ctx.staffId,
        newData: { requestId: r.id, type, preferredSchedule, objectiveId },
      });
      return r;
    });
    return ok(
      origin,
      {
        id: created.id,
        type: created.type,
        preferredSchedule: created.preferredSchedule,
        message: created.message,
        status: created.status,
        createdAt: created.createdAt,
      },
      "Support request sent",
      201,
    );
  });
}
