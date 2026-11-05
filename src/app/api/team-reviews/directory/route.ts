import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { loadTeamRows, matchesFilters } from "@/app/lib/manager-review";
import { ok } from "@/app/lib/pip";
import { guarded } from "@/app/lib/pip-employee";
import {
  NO_CYCLE_MESSAGE,
  emptyDirectory,
  enrichRows,
  openDashboard,
} from "@/app/lib/team-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const d = await openDashboard(request, { filters: true });
    if (!d.ok) return d.response;
    const limit = Math.min(
      Math.max(parseInt(d.sp.get("limit") ?? "25", 10) || 25, 1),
      50,
    );
    const offset = Math.max(parseInt(d.sp.get("offset") ?? "0", 10) || 0, 0);

    const cycle = d.cycle;
    if (!cycle)
      return ok(origin, emptyDirectory(d.actor, limit), NO_CYCLE_MESSAGE);

    const rows = (
      await loadTeamRows(d.companyId, cycle, d.actor, d.filters)
    ).filter((r) => matchesFilters(r, d.filters));
    const items = await enrichRows(
      d.companyId,
      cycle,
      rows.slice(offset, offset + limit),
    );
    return ok(
      origin,
      {
        cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
        total: rows.length,
        offset,
        limit,
        hasMore: offset + limit < rows.length,
        items,
        permissions: { canCalibrate: d.actor.companyWide },
      },
      "Team directory retrieved successfully",
    );
  });
}
