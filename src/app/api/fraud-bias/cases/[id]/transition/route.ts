import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute } from "@/app/lib/fraud-bias";
import { transitionCase } from "@/app/lib/fraud-bias-cases";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/fraud-bias/cases/:id/transition
// body: { companyId, action: START|ESCALATE|DEESCALATE|RESOLVE, assignedToId?, escalatedToId?, note?, outcome? }
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, { write: true }, async (ctx, body) =>
    transitionCase(ctx, (await context.params).id, body),
  );
}
