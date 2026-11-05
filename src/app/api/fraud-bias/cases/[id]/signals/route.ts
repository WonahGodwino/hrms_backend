import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import type { RouteContext } from "@/app/lib/self-appraisal";
import { fbRoute, httpErr } from "@/app/lib/fraud-bias";
import { linkSignal, unlinkSignal } from "@/app/lib/fraud-bias-cases";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// POST /api/fraud-bias/cases/:id/signals   body: { companyId, signalId }
export async function POST(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, { write: true }, async (ctx, body) => {
    if (typeof body.signalId !== "string")
      throw httpErr(400, "signalId is required");
    return linkSignal(ctx, (await context.params).id, body.signalId);
  });
}

// DELETE /api/fraud-bias/cases/:id/signals?companyId=&signalId=
export async function DELETE(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
) {
  return fbRoute(request, {}, async (ctx) => {
    const signalId = new URL(request.url).searchParams.get("signalId");
    if (!signalId) throw httpErr(400, "signalId is required");
    return unlinkSignal(ctx, (await context.params).id, signalId);
  });
}
