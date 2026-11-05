import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { buildComparisonPdf } from "@/app/lib/comparison-export";
import { fail, nameOf, notFound } from "@/app/lib/pip";
import { dashWriteCtx, sectionsToCsv } from "@/app/lib/succession-dashboard";

export const runtime = "nodejs"; // pdfkit needs Node APIs

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/reports/:id/export?companyId&format=pdf|csv   From the frozen snapshot; logs EXPORTED
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { id } = await context.params;
    const sp = new URL(request.url).searchParams;
    const c = await dashWriteCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { staffId, companyId } = c.ctx;
    const format = sp.get("format") ?? "pdf";
    if (format !== "pdf" && format !== "csv")
      return fail(origin, "format must be pdf or csv");

    const r = await prisma.successionReport.findFirst({
      where: {
        id,
        companyId,
        status: { not: "ARCHIVED" },
        OR: [{ createdById: staffId }, { sharedWithIds: { has: staffId } }],
      },
      select: { title: true, type: true, snapshot: true },
    });
    if (!r) return notFound(origin, "Report");
    const sections =
      (r.snapshot as unknown as { sections: any[] }).sections ?? [];
    const cycleName =
      (r.snapshot as unknown as { cycle?: { name: string } | null }).cycle
        ?.name ?? "No finalized cycle";
    await prisma.successionReportHistory.create({
      data: {
        reportId: id,
        companyId,
        action: "EXPORTED",
        actorId: staffId,
        newData: { format },
      },
    });

    if (format === "csv")
      return withCors(
        new NextResponse(sectionsToCsv(r.title, sections), {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="succession-${id}.csv"`,
            "Cache-Control": "no-store",
          },
        }),
        origin,
      );

    const me = await prisma.staffRecord.findUnique({
      where: { id: staffId },
      select: { firstName: true, lastName: true },
    });
    const pdf = await buildComparisonPdf({
      title: r.title,
      subtitle: `${r.type === "BOARD_PACK" ? "Board Leadership Continuity Pack" : "Succession Report"} | Cycle: ${cycleName}`,
      sections,
      generatedBy: nameOf(me) ?? "Unknown",
      generatedAt:
        new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    });
    return withCors(
      new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="succession-${id}.pdf"`,
          "Cache-Control": "no-store",
        },
      }),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
