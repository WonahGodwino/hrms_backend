import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import {
  fbRoute,
  httpErr,
  listReviewedCycles,
  auditFairness,
} from "@/app/lib/fraud-bias";
import { runScan } from "@/app/lib/fraud-bias-engine";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/fraud-bias/scan   body: { companyId, cycleId? }   always runs (decision 4)
export async function POST(request: NextRequest) {
  return fbRoute(request, { write: true }, async (ctx, body) => {
    const cycles = await listReviewedCycles(ctx.companyId);
    const cycle = body.cycleId
      ? cycles.find((c) => c.id === body.cycleId)
      : cycles[0];
    if (!cycle)
      throw httpErr(409, "No cycle with submitted manager reviews to scan");
    const run = await runScan(ctx.companyId, cycle.id, "MANUAL");
    await auditFairness(ctx, {
      action: "Fairness scan run manually",
      entityId: cycle.id,
      after: `${('reviewsScanned' in run ? run.reviewsScanned : 0) ?? 0} reviews scanned · ${('signalsOpen' in run ? run.signalsOpen : 0) ?? 0} open signals`,
    });
    return { cycleId: cycle.id, ...run };
  });
}
