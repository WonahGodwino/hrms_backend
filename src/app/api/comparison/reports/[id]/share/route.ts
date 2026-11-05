import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, readText, writeCtx } from "@/app/lib/pip";
import { notifyReportShared } from "@/app/lib/comparison-report";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/comparison/reports/:id/share   body: { companyId, sharedNote? }   Creator only; GENERATED to SHARED
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const body = await request.json();
    const c = await writeCtx(request, body?.companyId);
    if (!c.ok) return c.response;
    const { staffId, companyId } = c.ctx;
    const note = readText(body.sharedNote, "sharedNote", 1000);
    if ("error" in note) return fail(origin, note.error);

    const r = await prisma.comparisonReport.findFirst({
      where: {
        id,
        companyId,
        createdById: staffId,
        type: { not: "EMPLOYEE_PROFILE" },
      },
      select: { id: true, status: true, title: true },
    });
    if (!r) return notFound(origin, "Report");
    if (r.status !== "GENERATED")
      return fail(
        origin,
        r.status === "SHARED"
          ? "This report is already shared"
          : "This report can't be shared",
        409,
      );

    const flipped = await prisma.$transaction(async (tx) => {
      const u = await tx.comparisonReport.updateMany({
        where: { id, status: "GENERATED" },
        data: {
          status: "SHARED",
          sharedAt: new Date(),
          sharedNote: note.value,
        },
      });
      if (u.count !== 1) return false;
      await tx.comparisonReportHistory.create({
        data: {
          reportId: id,
          companyId,
          action: "SHARED",
          actorId: staffId,
          previousData: { status: "GENERATED" },
        },
      });
      return true;
    });
    if (!flipped)
      return fail(
        origin,
        "This report was changed by someone else. Refresh and try again",
        409,
      );
    await notifyReportShared({
      companyId,
      reportId: id,
      actorId: staffId,
      title: r.title,
    });
    return ok(origin, { id, status: "SHARED" }, "Report shared with HR");
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
