import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, nameOf, notFound, ok, readCtx, writeCtx } from "@/app/lib/pip";
import { REPORT_LABELS, canSeeReport } from "@/app/lib/comparison-report";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/reports/:id?companyId   Frozen snapshot: { cycle, scope, sections[] }
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await readCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { actor, companyId, staffId } = c.ctx;
    const r = await prisma.comparisonReport.findFirst({
      where: { id, companyId, status: { not: "ARCHIVED" } },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        cycle: { select: { id: true, name: true } },
      },
    });
    if (!r || !canSeeReport(actor, staffId, r))
      return notFound(origin, "Report");
    return ok(origin, {
      id: r.id,
      title: r.title,
      type: r.type,
      typeLabel: REPORT_LABELS[r.type],
      status: r.status,
      cycle: r.cycle,
      config: r.config,
      snapshot: r.snapshot,
      generatedAt: r.generatedAt,
      sharedAt: r.sharedAt,
      sharedNote: r.sharedNote,
      createdBy: nameOf(r.createdBy),
      mine: r.createdById === staffId,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// DELETE /api/comparison/reports/:id?companyId   Soft archive, creator only
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const c = await writeCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const { staffId, companyId } = c.ctx;
    const r = await prisma.comparisonReport.findFirst({
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
      await tx.comparisonReport.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await tx.comparisonReportHistory.create({
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
