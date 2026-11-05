import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import {
  buildGaps,
  dashCtx,
  loadRoleModel,
} from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/gaps?companyId   Top 10 roles with a gap reason (decision 21)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const c = await dashCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    return ok(
      origin,
      buildGaps(await loadRoleModel(c.ctx.companyId, new Map())),
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
