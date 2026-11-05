import { NextRequest, NextResponse } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute, httpErr } from "@/app/lib/fraud-bias";
import {
  recordExport,
  reportToCsv,
  reportToPdf,
} from "@/app/lib/fraud-bias-report";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/reports/:id/export?companyId=&format=pdf|csv
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, {}, async (ctx) => {
    const format = (
      new URL(request.url).searchParams.get("format") ?? "pdf"
    ).toLowerCase();
    if (format !== "pdf" && format !== "csv")
      throw httpErr(400, "format must be pdf or csv");
    const report = await recordExport(ctx, (await context.params).id, format);
    const name = `fairness-report-${report.id}.${format}`;
    const headers = { "Content-Disposition": `attachment; filename="${name}"` };
    if (format === "csv")
      return new NextResponse(reportToCsv(report), {
        headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
      });
    return new NextResponse(new Uint8Array(await reportToPdf(report)), {
      headers: { ...headers, "Content-Type": "application/pdf" },
    });
  });
}
