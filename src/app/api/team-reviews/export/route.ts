import { NextRequest, NextResponse } from "next/server";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { handleApiError } from "@/app/lib/utils";
import { loadTeamRows, matchesFilters } from "@/app/lib/manager-review";
import { PipHttpError } from "@/app/lib/pip-employee";
import { fail } from "@/app/lib/pip";
import {
  DirectoryRow,
  NO_CYCLE_MESSAGE,
  buildCsv,
  enrichRows,
  openDashboard,
} from "@/app/lib/team-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const MAX_ROWS = 500;
const CHUNK = 25;

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const d = await openDashboard(request, { filters: true });
    if (!d.ok) return d.response;
    const cycle = d.cycle;
    if (!cycle)
      return fail(
        origin,
        `${NO_CYCLE_MESSAGE} There is nothing to export.`,
        409,
      );

    const rows = (await loadTeamRows(d.companyId, cycle, d.actor, d.filters))
      .filter((r) => matchesFilters(r, d.filters))
      .slice(0, MAX_ROWS);
    const enriched: DirectoryRow[] = [];
    for (let i = 0; i < rows.length; i += CHUNK)
      enriched.push(
        ...(await enrichRows(d.companyId, cycle, rows.slice(i, i + CHUNK))),
      );

    const stamp = new Date().toISOString().slice(0, 10);
    const safe =
      cycle.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cycle";
    return withCors(
      new NextResponse(buildCsv(cycle.name, enriched), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="team-performance-${safe}-${stamp}.csv"`,
        },
      }),
      origin,
    );
  } catch (e) {
    if (e instanceof PipHttpError) return fail(origin, e.message, e.status);
    return withCors(handleApiError(e), origin);
  }
}
