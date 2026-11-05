import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, nameOf, notFound, writeCtx } from "@/app/lib/pip";
import { buildComparisonPdf } from "@/app/lib/comparison-export";
import { buildProfile, profileSections } from "@/app/lib/comparison-report";

export const runtime = "nodejs"; // pdfkit needs Node APIs

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/employees/:staffRecordId/export?companyId&cycleId?   (decision 24)
// Saves a hidden EMPLOYEE_PROFILE report row so the export is logged (EXPORTED).
export async function GET(
  request: NextRequest,
  context: RouteContext<{ staffRecordId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { staffRecordId } = await context.params;
    const sp = new URL(request.url).searchParams;
    const c = await writeCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, staffId, companyId } = c.ctx;

    const r = await buildProfile(
      companyId,
      actor,
      staffId,
      staffRecordId,
      sp.get("cycleId"),
    );
    if ("error" in r)
      return r.status === 404
        ? notFound(origin, "Employee")
        : fail(origin, r.error, r.status);
    const d = r.data as any;
    if (!d.released)
      return fail(
        origin,
        "No completed appraisal result is available to export",
        409,
      );

    const sections = profileSections(d);
    const me = await prisma.staffRecord.findUnique({
      where: { id: staffId },
      select: { firstName: true, lastName: true },
    });
    const pdf = await buildComparisonPdf({
      title: `${d.employee.name} - Performance Profile`,
      subtitle: `Cycle: ${d.cycle.name}`,
      sections,
      generatedBy: nameOf(me) ?? "Unknown",
      generatedAt:
        new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    });
    await prisma.$transaction(async (tx) => {
      const rep = await tx.comparisonReport.create({
        data: {
          companyId,
          createdById: staffId,
          cycleId: d.cycle.id,
          type: "EMPLOYEE_PROFILE",
          title: `Profile - ${d.employee.name}`,
          status: "GENERATED",
          config: { staffRecordIds: [staffRecordId] },
          snapshot: { cycle: d.cycle, sections } as any,
          generatedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.comparisonReportHistory.create({
        data: {
          reportId: rep.id,
          companyId,
          action: "EXPORTED",
          actorId: staffId,
          newData: { format: "pdf", staffRecordId },
        },
      });
    });
    return withCors(
      new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="profile-${staffRecordId}.pdf"`,
          "Cache-Control": "no-store",
        },
      }),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
