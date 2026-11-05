import { NextRequest, NextResponse } from "next/server";
import prisma from "@/app/lib/prisma";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { nameOf, notFound, writeCtx } from "@/app/lib/pip";
import { buildComparisonPdf } from "@/app/lib/comparison-export";
import { REPORT_LABELS, canSeeReport } from "@/app/lib/comparison-report";

export const runtime = "nodejs"; // pdfkit needs Node APIs

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/reports/:id/export?companyId   PDF from the frozen snapshot; logs EXPORTED
export async function GET(
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
    const { actor, staffId, companyId } = c.ctx;
    const r = await prisma.comparisonReport.findFirst({
      where: { id, companyId, status: { not: "ARCHIVED" } },
      include: { cycle: { select: { name: true } } },
    });
    if (!r || !r.snapshot || !canSeeReport(actor, staffId, r))
      return notFound(origin, "Report");

    const me = await prisma.staffRecord.findUnique({
      where: { id: staffId },
      select: { firstName: true, lastName: true },
    });
    const snap = r.snapshot as unknown as { sections: any[] };
    const pdf = await buildComparisonPdf({
      title: r.title,
      subtitle: `${REPORT_LABELS[r.type]} | Cycle: ${r.cycle.name}`,
      sections: snap.sections,
      generatedBy: nameOf(me) ?? "Unknown",
      generatedAt:
        new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    });
    await prisma.comparisonReportHistory.create({
      data: {
        reportId: id,
        companyId,
        action: "EXPORTED",
        actorId: staffId,
        newData: { format: "pdf" },
      },
    });
    return withCors(
      new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="comparison-${id}.pdf"`,
          "Cache-Control": "no-store",
        },
      }),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
