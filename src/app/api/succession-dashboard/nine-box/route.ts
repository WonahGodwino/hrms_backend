import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok } from "@/app/lib/pip";
import { buildNineBox, dashCtx } from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/nine-box?companyId&cycleId?&departmentId?   (decisions 18, 19)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await dashCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const r = await buildNineBox(
      c.ctx.companyId,
      sp.get("cycleId"),
      sp.get("departmentId"),
    );
    if ("error" in r) return fail(origin, r.error, r.status);
    return ok(origin, r.data);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
