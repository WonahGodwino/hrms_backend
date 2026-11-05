import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute } from "@/app/lib/fraud-bias";
import { getCaseDetail, patchCase } from "@/app/lib/fraud-bias-cases";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/fraud-bias/cases/:id?companyId=
export async function GET(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, {}, async (ctx) =>
    getCaseDetail(ctx.companyId, (await context.params).id),
  );
}

// PATCH /api/fraud-bias/cases/:id   body: { companyId, assignedToId?, severity?, summary?, title? }
export async function PATCH(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, { write: true }, async (ctx, body) =>
    patchCase(ctx, (await context.params).id, body),
  );
}
