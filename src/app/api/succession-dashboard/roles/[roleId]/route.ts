import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { fail, ok } from "@/app/lib/pip";
import { buildRoleDetail, dashCtx } from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/roles/:roleId?companyId   Drawer in role mode (decisions 12, 24)
export async function GET(
  request: NextRequest,
  context: RouteContext<{ roleId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const { roleId } = await context.params;
    const c = await dashCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const r = await buildRoleDetail(c.ctx.companyId, roleId);
    if ("error" in r) return fail(origin, r.error, r.status);
    return ok(origin, r.data);
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
