import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { myRoute, buildMyPerformance } from "@/app/lib/my-performance";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/my-performance/summary?companyId=
// Own record only. Scores are shown only for released cycles; progress covers the open cycle.
export async function GET(request: NextRequest) {
  return myRoute(request, (ctx) =>
    buildMyPerformance(ctx.companyId, ctx.staffId),
  );
}
