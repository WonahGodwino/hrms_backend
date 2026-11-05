import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { guarded } from "@/app/lib/pip-employee";
import { automationReadCtx, buildOverview } from "@/app/lib/automation";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/automation/overview?companyId=...  (KPI cards and compliance counts, from LIVE runs)
export async function GET(request: NextRequest) {
  return guarded(request, async (origin) => {
    const ctx = await automationReadCtx(
      request,
      request.nextUrl.searchParams.get("companyId"),
    );
    const data = await buildOverview(ctx.companyId);
    try {
      const { maybeSweep } = require("@/app/lib/automation-scheduled");
      maybeSweep(ctx.companyId, "ACTIVITY").catch(() => {});
    } catch {}
    return ok(origin, data);
  });
}
