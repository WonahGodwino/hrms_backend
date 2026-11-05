import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok, readCtx } from "@/app/lib/pip";
import { BANDS } from "@/app/lib/manager-review";
import {
  MANAGERS_SEE_POTENTIAL,
  cycleView,
  loadAssessments,
  peopleWhere,
  resolveBasisCycle,
} from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

type Band = "LOW" | "MEDIUM" | "HIGH";
const LABELS: Record<string, string> = {
  "HIGH/HIGH": "Future Leaders",
  "HIGH/MEDIUM": "High Potential",
  "HIGH/LOW": "Enigma",
  "MEDIUM/HIGH": "High Performer",
  "MEDIUM/MEDIUM": "Core Contributors",
  "MEDIUM/LOW": "Inconsistent Performer",
  "LOW/HIGH": "Trusted Professional",
  "LOW/MEDIUM": "Effective Contributor",
  "LOW/LOW": "Risk",
};
const perfBand = (s: number): Band =>
  s > BANDS.good ? "HIGH" : s < BANDS.actionNeeded ? "LOW" : "MEDIUM";
const PER_CELL = 5;

// GET /api/promotions/talent-matrix?companyId&cycleId?   (decisions 21-23)
// x = performance (low to high), y = potential (high at the top). Everyone in scope with a released result and assessed potential.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;

    if (!actor.companyWide && !MANAGERS_SEE_POTENTIAL)
      return ok(origin, {
        restricted: true,
        cells: [],
        notAssessed: 0,
        cycle: null,
      });
    const resolved = await resolveBasisCycle(
      companyId,
      peopleWhere(actor),
      sp.get("cycleId"),
    );
    if ("error" in resolved)
      return fail(origin, resolved.error, resolved.status);
    const { cycle } = resolved;
    if (!cycle)
      return ok(origin, {
        restricted: false,
        cells: [],
        notAssessed: 0,
        cycle: null,
      });

    const all = await loadAssessments(companyId, cycle, peopleWhere(actor));
    const placed = all.filter((a) => a.score !== null && a.potential);
    const rows: Band[] = ["HIGH", "MEDIUM", "LOW"]; // top to bottom
    const cols: Band[] = ["LOW", "MEDIUM", "HIGH"]; // left to right
    const cells = rows.flatMap((potential) =>
      cols.map((performance) => {
        const members = placed
          .filter(
            (a) =>
              a.potential === potential &&
              perfBand(a.score as number) === performance,
          )
          .sort((a, b) => (b.score as number) - (a.score as number));
        return {
          key: `${potential}/${performance}`,
          label: LABELS[`${potential}/${performance}`],
          potential,
          performance,
          total: members.length,
          people: members
            .slice(0, PER_CELL)
            .map((a) => ({
              id: a.staffRecordId,
              name: a.name,
              avatarUrl: a.avatarUrl,
              scorePct: a.score,
            })),
          extra: Math.max(0, members.length - PER_CELL),
        };
      }),
    );
    return ok(origin, {
      restricted: false,
      cycle: cycleView(cycle),
      cells,
      assessed: placed.length,
      notAssessed: all.length - placed.length,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
