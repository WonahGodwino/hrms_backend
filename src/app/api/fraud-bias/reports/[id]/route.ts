import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute, httpErr } from "@/app/lib/fraud-bias";
import { forCompany } from "@/app/lib/data/tenant";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/reports/:id?companyId=
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, {}, async (ctx) => {
    const r = await forCompany(ctx.companyId).fairnessReport.findFirst({
      where: { id: (await context.params).id },
    });
    if (!r) throw httpErr(404, "Report not found");
    return r;
  });
}
