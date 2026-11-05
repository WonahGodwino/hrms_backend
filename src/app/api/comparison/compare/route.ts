import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok, readCtx } from "@/app/lib/pip";
import {
  COMPARE_MAX,
  buildCards,
  getBasis,
  parseFilters,
} from "@/app/lib/comparison";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/compare?companyId&cycleId?&staffRecordIds=a,b&competencyIds?
// Selected people keep their card even when filters would exclude them (decision 7), so band and KPI filters are not applied here.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const ids = [
      ...new Set((sp.get("staffRecordIds") ?? "").split(",").filter(Boolean)),
    ];
    if (!ids.length || ids.length > COMPARE_MAX)
      return fail(origin, `Select 1 to ${COMPARE_MAX} employees`);
    const parsed = parseFilters(sp);
    if ("error" in parsed) return fail(origin, parsed.error);
    const basis = await getBasis(companyId, actor, sp.get("cycleId"));
    if ("error" in basis) return fail(origin, basis.error, basis.status);
    return ok(
      origin,
      await buildCards(
        companyId,
        actor,
        basis,
        ids,
        parsed.filters.competencyIds,
      ),
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
