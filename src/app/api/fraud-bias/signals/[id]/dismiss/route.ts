import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute, httpErr, txt, auditFairness } from "@/app/lib/fraud-bias";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/fraud-bias/signals/:id/dismiss   body: { companyId, note }
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, { write: true }, async (ctx, body) => {
    const { id } = await context.params;
    const note = txt(body.note, "note", true)!;
    const s = await prisma.fairnessSignal.findFirst({
      where: { id, companyId: ctx.companyId },
      select: { status: true, severity: true },
    });
    if (!s) throw httpErr(404, "Signal not found");
    if (s.status === "UNDER_INVESTIGATION")
      throw httpErr(
        409,
        "This signal is under investigation. Resolve its case instead.",
      );
    await prisma.$transaction(async (tx) => {
      const r = await tx.fairnessSignal.updateMany({
        where: { id, companyId: ctx.companyId, status: "OPEN" },
        data: {
          status: "DISMISSED",
          dismissedAt: new Date(),
          dismissedByUserId: ctx.actorUserId,
          dismissedByName: ctx.actorName,
          dismissalNote: note,
        },
      });
      if (!r.count)
        throw httpErr(
          409,
          "This signal was changed by someone else. Refresh and try again.",
        );
      await tx.fairnessSignalHistory.create({
        data: {
          signalId: id,
          companyId: ctx.companyId,
          action: "DISMISSED",
          actorUserId: ctx.actorUserId,
          actorName: ctx.actorName,
          previousData: { status: "OPEN" },
          newData: { status: "DISMISSED" },
        },
      });
    });
    await auditFairness(ctx, {
      action: "Fairness signal dismissed",
      entityId: id,
      risk: s.severity,
      status: "RESOLVED",
      before: "OPEN",
      after: "DISMISSED",
    });
    return { id, status: "DISMISSED" };
  });
}
