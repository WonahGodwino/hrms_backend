import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { logPip, ok } from "@/app/lib/pip";
import {
  Params,
  employeeWriteCtx,
  guarded,
  ownLivePip,
  readBody,
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
    const acknowledgedAt = await prisma.$transaction(async (tx) => {
      const pip = await ownLivePip(tx, ctx, id);
      if (pip.acknowledgedAt) return pip.acknowledgedAt;
      const now = new Date();
      await tx.pip.update({ where: { id }, data: { acknowledgedAt: now } });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "ACKNOWLEDGED",
        actorId: ctx.staffId,
        newData: { acknowledgedAt: now.toISOString() },
      });
      return now;
    });
    return ok(origin, { acknowledgedAt }, "Plan acknowledged");
  });
}
