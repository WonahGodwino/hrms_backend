import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok, readCtx } from "@/app/lib/pip";
import { buildOverview, getBasis, parseFilters } from "@/app/lib/comparison";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/overview?companyId&cycleId?&departmentId?&bands?&kpiMin?&kpiMax?&competencyIds?
// Top-control chips and the four hero cards, from one filtered population (decisions 9-13).
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
    return ok(
      origin,
      await buildOverview(companyId, actor, basis, parsed.filters),
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
