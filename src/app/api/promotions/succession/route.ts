import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { ok, readCtx } from "@/app/lib/pip";
import { loadSuccession } from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/promotions/succession?companyId   Backs the Succession tab, the modal's role list and the coverage card (decisions 28-30)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const c = await readCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const data = await loadSuccession(c.ctx.companyId, c.ctx.actor);
    return ok(origin, { ...data, canManageRoles: c.ctx.actor.companyWide });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
