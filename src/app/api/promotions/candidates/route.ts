import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok, readCtx } from "@/app/lib/pip";
import {
  MAX_POOL,
  READINESS_RANK,
  cycleView,
  loadAssessments,
  loadCardExtras,
  peopleWhere,
  resolveBasisCycle,
  toCard,
} from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/promotions/candidates?companyId&cycleId?&search?&departmentId?
// The pool: released result in the basis cycle, score at least 60, active, no open PIP (decisions 3, 20).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;

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
        cycle: null,
        candidates: [],
        total: 0,
        truncated: false,
      });

    const pool = (
      await loadAssessments(
        companyId,
        cycle,
        peopleWhere(actor, sp.get("search"), sp.get("departmentId")),
      )
    ).filter((a) => a.eligible);
    const extras = await loadCardExtras(companyId, cycle.id, pool);
    const cards = pool
      .map((a) => toCard(a, extras, actor))
      .sort(
        (a, b) =>
          (a.readiness ? READINESS_RANK[a.readiness] : 3) -
            (b.readiness ? READINESS_RANK[b.readiness] : 3) ||
          (b.metrics.appraisalPct ?? 0) - (a.metrics.appraisalPct ?? 0) ||
          a.name.localeCompare(b.name),
      );
    return ok(origin, {
      cycle: cycleView(cycle),
      candidates: cards.slice(0, MAX_POOL),
      total: cards.length,
      truncated: cards.length > MAX_POOL,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
