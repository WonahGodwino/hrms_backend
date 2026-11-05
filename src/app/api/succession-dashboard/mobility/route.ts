import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok } from "@/app/lib/pip";
import { buildMobility, dashCtx } from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/mobility?companyId&range=last4|2026   (decisions 22, 23)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await dashCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const range = sp.get("range") ?? "last4";
    if (range !== "last4" && !/^\d{4}$/.test(range))
      return fail(origin, "range must be last4 or a four-digit year");
    return ok(origin, await buildMobility(c.ctx.companyId, range));
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
