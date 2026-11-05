import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { loadTeamRows } from "@/app/lib/manager-review";
import { ok } from "@/app/lib/pip";
import { guarded } from "@/app/lib/pip-employee";
import {
  NO_CYCLE_MESSAGE,
  buildAnalytics,
  emptyAnalytics,
  openDashboard,
} from "@/app/lib/team-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const d = await openDashboard(request);
    if (!d.ok) return d.response;
    const cycle = d.cycle;
    if (!cycle) return ok(origin, emptyAnalytics(), NO_CYCLE_MESSAGE);
    const rows = await loadTeamRows(d.companyId, cycle, d.actor);
    return ok(
      origin,
      await buildAnalytics(d.companyId, cycle, d.actor, rows),
      "Team analytics retrieved successfully",
    );
  });
}
