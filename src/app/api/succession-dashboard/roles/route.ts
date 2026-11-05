import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { fail, ok } from "@/app/lib/pip";
import {
  TIER_LABELS,
  buildRoleList,
  dashCtx,
  loadRoleModel,
} from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/roles?companyId&departmentId?&tier?   departmentId "none" = Unassigned (decision 8)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await dashCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const tier = sp.get("tier");
    if (tier && !(tier in TIER_LABELS))
      return fail(
        origin,
        `tier must be one of: ${Object.keys(TIER_LABELS).join(", ")}`,
      );
    const model = await loadRoleModel(c.ctx.companyId, new Map());
    return ok(
      origin,
      buildRoleList(model, { departmentId: sp.get("departmentId"), tier }),
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
