import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { fbRoute } from "@/app/lib/fraud-bias";
import { getView, buildSummary } from "@/app/lib/fraud-bias-engine";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/summary?companyId=&cycleId=
export async function GET(request: NextRequest) {
  return fbRoute(request, {}, async (ctx) => {
    const view = await getView(
      ctx.companyId,
      new URL(request.url).searchParams.get("cycleId"),
    );
    return {
      ...(await buildSummary(ctx.companyId, view)),
      cycles: view.cycles,
    };
  });
}
