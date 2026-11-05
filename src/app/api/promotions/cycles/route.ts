import { NextRequest } from "next/server";
import { handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { ok, readCtx } from "@/app/lib/pip";
import { cycleView, listBasisCycles, peopleWhere } from "@/app/lib/promotion";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/promotions/cycles?companyId   Cycles with released results in scope (decision 15)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const c = await readCtx(
      request,
      new URL(request.url).searchParams.get("companyId"),
    );
    if (!c.ok) return c.response;
    const list = await listBasisCycles(
      c.ctx.companyId,
      peopleWhere(c.ctx.actor),
    );
    return ok(origin, {
      cycles: list.map(cycleView),
      defaultCycleId: list[0]?.id ?? null,
    });
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
