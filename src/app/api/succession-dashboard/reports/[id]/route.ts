import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { notFound, ok } from "@/app/lib/pip";
import { dashWriteCtx } from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// DELETE /api/succession-dashboard/reports/:id?companyId   Soft archive, creator only
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await dashWriteCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { staffId, companyId } = c.ctx;
    const r = await prisma.successionReport.findFirst({
      where: {
        id,
        companyId,
        createdById: staffId,
        status: { not: "ARCHIVED" },
      },
      select: { id: true, status: true },
    });
    if (!r) return notFound(origin, "Report");
    await prisma.$transaction(async (tx) => {
      await tx.successionReport.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await tx.successionReportHistory.create({
        data: {
          reportId: id,
          companyId,
          action: "ARCHIVED",
          actorId: staffId,
          previousData: { status: r.status },
        },
      });
    });
    return ok(origin, { id, status: "ARCHIVED" }, "Report archived");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
