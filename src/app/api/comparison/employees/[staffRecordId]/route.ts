import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, notFound, ok, readCtx } from "@/app/lib/pip";
import { buildProfile } from "@/app/lib/comparison-report";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/comparison/employees/:staffRecordId?companyId&cycleId?   Drawer (decision 24)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ staffRecordId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { staffRecordId } = await context.params;
    const sp = new URL(request.url).searchParams;
    const c = await readCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const r = await buildProfile(
      c.ctx.companyId,
      c.ctx.actor,
      c.ctx.staffId,
      staffRecordId,
      sp.get("cycleId"),
    );
    if ("error" in r)
      return r.status === 404
        ? notFound(origin, "Employee")
        : fail(origin, r.error, r.status);
    return ok(origin, r.data);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
