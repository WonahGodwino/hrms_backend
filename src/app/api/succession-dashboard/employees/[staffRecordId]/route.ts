import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, ok } from "@/app/lib/pip";
import { buildEmployee, dashCtx } from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/employees/:staffRecordId?companyId&cycleId?   Drawer in employee mode (decision 12)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ staffRecordId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { staffRecordId } = await context.params;
    const sp = new URL(request.url).searchParams;
    const c = await dashCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const r = await buildEmployee(
      c.ctx.companyId,
      c.ctx.actor,
      staffRecordId,
      sp.get("cycleId"),
    );
    if ("error" in r) return fail(origin, r.error, r.status);
    return ok(origin, r.data);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
