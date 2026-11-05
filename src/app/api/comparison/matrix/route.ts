import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok, readCtx } from "@/app/lib/pip";
import {
  COMPARE_MAX,
  buildMatrix,
  getBasis,
  parseFilters,
} from "@/app/lib/comparison";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/matrix?companyId&cycleId?&(filters)&staffRecordIds?
// Department matrix + leaderboard follow the filters; the calibration matrix follows the selection (decisions 16-19).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const { actor, companyId } = c.ctx;
    const parsed = parseFilters(sp);
    if ("error" in parsed) return fail(origin, parsed.error);
    const selection = [
      ...new Set((sp.get("staffRecordIds") ?? "").split(",").filter(Boolean)),
    ].slice(0, COMPARE_MAX);
    const basis = await getBasis(companyId, actor, sp.get("cycleId"));
    if ("error" in basis) return fail(origin, basis.error, basis.status);
    return ok(
      origin,
      await buildMatrix(companyId, actor, basis, parsed.filters, selection),
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
