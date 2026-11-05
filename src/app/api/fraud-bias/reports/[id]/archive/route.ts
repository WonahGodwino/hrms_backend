import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute, httpErr } from "@/app/lib/fraud-bias";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/fraud-bias/reports/:id/archive   body: { companyId }   (soft removal)
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, { write: true }, async (ctx) => {
    const id = (await context.params).id;
    await prisma.$transaction(async (tx) => {
      const r = await tx.fairnessReport.updateMany({
        where: { id, companyId: ctx.companyId, status: "GENERATED" },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      if (!r.count) throw httpErr(404, "Report not found or already archived");
      await tx.fairnessReportHistory.create({
        data: {
          reportId: id,
          companyId: ctx.companyId,
          action: "ARCHIVED",
          actorUserId: ctx.actorUserId,
          actorName: ctx.actorName,
        },
      });
    });
    return { id, status: "ARCHIVED" };
  });
}
