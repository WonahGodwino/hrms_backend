import { NextRequest, NextResponse } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  authorizeSelf,
  historyCsv,
  historyHtml,
  loadHistory,
} from "@/app/lib/appraisal-history";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-history/export?companyId=...&format=csv|print&cycleId=... (cycleId optional)
// csv: file download (opens in Excel). print: a print-ready HTML page that opens the print dialog
// (Save as PDF). Without cycleId it exports the whole history. Unreleased cycles export without scores.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const auth = await authorizeSelf(request, origin);
    if ("response" in auth) return auth.response;
    const format = auth.searchParams.get("format") ?? "csv";
    if (!["csv", "print"].includes(format))
      return withCors(
        ApiResponse.error("format must be csv or print", 400),
        origin,
      );
    const cycleId = auth.searchParams.get("cycleId");

    let rows = await loadHistory(auth.companyId, auth.self.id);
    if (cycleId) {
      rows = rows.filter((r) => r.cycleId === cycleId);
      if (rows.length === 0)
        return withCors(
          ApiResponse.error("Appraisal cycle not found", 404),
          origin,
        );
    }

    if (format === "csv") {
      return withCors(
        new NextResponse(historyCsv(rows), {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${cycleId ? `appraisal-${cycleId}` : "appraisal-history"}.csv"`,
          },
        }),
        origin,
      );
    }
    return withCors(
      new NextResponse(
        historyHtml(
          cycleId ? `${rows[0].period}: Appraisal` : "Appraisal History",
          rows,
          !!cycleId,
        ),
        {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
