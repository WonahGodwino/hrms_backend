import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { loadTeamRows } from "@/app/lib/manager-review";
import { ok } from "@/app/lib/pip";
import { guarded } from "@/app/lib/pip-employee";
import {
  NO_CYCLE_MESSAGE,
  buildOverview,
  emptyOverview,
  openDashboard,
} from "@/app/lib/team-dashboard";
import { maybeSweep } from "@/app/lib/automation-scheduled";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const d = await openDashboard(request);
    if (!d.ok) return d.response;
    const cycle = d.cycle;
    if (!cycle) return ok(origin, emptyOverview(d.actor), NO_CYCLE_MESSAGE);
    const rows = await loadTeamRows(d.companyId, cycle, d.actor);
    const data = await buildOverview(d.companyId, cycle, d.actor, rows);
    try {
      maybeSweep(d.companyId, "ACTIVITY").catch(() => {});
    } catch { /* ignored: best-effort, failure is non-fatal */ }
    return ok(origin, data, "Team overview retrieved successfully");
  });
}
