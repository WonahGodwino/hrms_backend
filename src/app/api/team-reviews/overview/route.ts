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
      const { maybeSweep } = require("@/app/lib/automation-scheduled");
      maybeSweep(d.companyId, "ACTIVITY").catch(() => {});
    } catch {}
    return ok(origin, data, "Team overview retrieved successfully");
  });
}
