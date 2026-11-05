import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok } from "@/app/lib/pip";
import { buildSummary, dashCtx } from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/summary?companyId&cycleId?
// Six hero cards (decision 9). Without a cycleId it also writes today's snapshot (decision 15).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await dashCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const r = await buildSummary(c.ctx.companyId, sp.get("cycleId"));
    if ("error" in r) return fail(origin, r.error, r.status);
    return ok(origin, r.data);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
