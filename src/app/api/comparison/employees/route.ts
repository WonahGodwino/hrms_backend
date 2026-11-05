import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok, readCtx } from "@/app/lib/pip";
import {
  BAND_LABELS,
  MAX_LIST,
  applyFilters,
  byScore,
  emptyReason,
  getBasis,
  loadPopulation,
  parseFilters,
} from "@/app/lib/comparison";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/employees?companyId&cycleId?&search?&(filters)
// The picker list, best first. defaultSelection = the top 2 of the filtered population (decision 7).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const parsed = parseFilters(sp);
    if ("error" in parsed) return fail(origin, parsed.error);
    const basis = await getBasis(companyId, actor, sp.get("cycleId"));
    if ("error" in basis) return fail(origin, basis.error, basis.status);
    if (!basis.cycle)
      return ok(origin, {
        cycle: null,
        items: [],
        defaultSelection: [],
        total: 0,
        truncated: false,
        emptyReason: await emptyReason(companyId, actor, basis, 0),
      });

    const tokens = (sp.get("search") ?? "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5);
    const pop = applyFilters(
      await loadPopulation(companyId, actor, basis.cycle),
      parsed.filters,
    ).sort(byScore);
    const items = pop
      .filter((m) =>
        tokens.every((t) =>
          `${m.name} ${m.staffNumber} ${m.roleTitle ?? ""}`
            .toLowerCase()
            .includes(t),
        ),
      )
      .map((m) => ({
        id: m.staffRecordId,
        name: m.name,
        avatarUrl: m.avatarUrl,
        roleTitle: m.roleTitle,
        departmentName: m.departmentName,
        score: Math.round(m.score),
        kpi: m.kpi === null ? null : Math.round(m.kpi),
        band: m.band,
        bandLabel: BAND_LABELS[m.band],
      }));
    return ok(origin, {
      cycle: { id: basis.cycle.id, name: basis.cycle.name },
      items: items.slice(0, MAX_LIST),
      defaultSelection: pop.slice(0, 2).map((m) => m.staffRecordId),
      total: items.length,
      truncated: items.length > MAX_LIST,
      emptyReason: await emptyReason(companyId, actor, basis, items.length),
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
