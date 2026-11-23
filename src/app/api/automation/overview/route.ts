import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { guarded } from "@/app/lib/pip-employee";
import { automationReadCtx, buildOverview } from "@/app/lib/automation";
import { maybeSweep } from "@/app/lib/automation-scheduled";

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
      maybeSweep(ctx.companyId, "ACTIVITY").catch(() => {});
    } catch { /* ignored: best-effort, failure is non-fatal */ }
    return ok(origin, data);
  });
}
