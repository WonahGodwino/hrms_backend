import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import { logPip, ok, writeCtx } from "@/app/lib/pip";
import {
  EMP_LIMITS,
  Params,
  bail,
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
  { params }: Params<{ id: string; requestId: string }>,
) {
  const { id, requestId } = await params;
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const r = await writeCtx(request, body.companyId);
    if (!r.ok) return r.response;
    const ctx = r.ctx;
    const status = oneOf(
      body.status,
      ["ACCEPTED", "DECLINED", "RESOLVED"] as const,
      "status",
    );
    const response = text(
      body.response,
      "response",
      EMP_LIMITS.supportResponse,
      { required: status === "DECLINED" },
    );

    const updated = await prisma.$transaction(async (tx) => {
      await managedPip(tx, ctx, id, "live");
      const req = await tx.pipSupportRequest.findFirst({
        where: { id: requestId, pipId: id },
      });
      if (!req) return bail(404, "Support request not found");
      if (req.status === "DECLINED" || req.status === "RESOLVED")
        return bail(409, "This request is already closed");
      if (req.status === "ACCEPTED" && status !== "RESOLVED")
        return bail(409, "An accepted request can only be resolved");
      const u = await tx.pipSupportRequest.update({
        where: { id: requestId },
        data: {
          status,
          response: response ?? req.response,
          respondedById: ctx.staffId,
          respondedAt: new Date(),
        },
      });
      await logPip(tx, {
        pipId: id,
        companyId: ctx.companyId,
        action: "SUPPORT_RESPONDED",
        actorId: ctx.staffId,
        previousData: { status: req.status },
        newData: { requestId, status },
      });
      return u;
    });
    return ok(origin, updated, "Response saved");
  });
}
