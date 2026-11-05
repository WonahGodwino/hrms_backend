import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import {
  buildHealth,
  dashCtx,
  loadRoleModel,
  roleStats,
} from "@/app/lib/succession-dashboard";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/succession-dashboard/health?companyId&range=last12|2026   (decision 11)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const sp = new URL(request.url).searchParams;
    const c = await dashCtx(request, sp.get("companyId"));
    if (!c.ok) return c.response;
    const live = roleStats(await loadRoleModel(c.ctx.companyId, new Map()));
    return ok(
      origin,
      await buildHealth(c.ctx.companyId, sp.get("range") ?? "last12", live),
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
