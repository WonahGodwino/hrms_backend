import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { ok } from "@/app/lib/pip";
import { bail, guarded, readBody } from "@/app/lib/pip-employee";
import { automationWriteCtx, isExecutorEnabled } from "@/app/lib/automation";
import { maybeSweep } from "@/app/lib/automation-scheduled";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/automation/run-checks { companyId }
// On-demand manual trigger for scheduled automation checks.
export async function POST(request: NextRequest) {
  return guarded(request, async (origin) => {
    const body = await readBody(request);
    const ctx = await automationWriteCtx(request, body.companyId);

    if (!isExecutorEnabled()) {
      return bail(409, "The automation executor is turned off.");
    }

    const res = await maybeSweep(ctx.companyId, "MANUAL");

    return ok(
      origin,
      {
        throttled: res.throttled,
        eventsEmitted: res.eventsEmitted,
        eventsProcessed: res.eventsProcessed,
        runsCreated: res.runsCreated,
        lastSweepAt: res.lastSweepAt,
      },
      res.throttled ? "Checks ran moments ago" : "Automation checks completed",
    );
  });
}
