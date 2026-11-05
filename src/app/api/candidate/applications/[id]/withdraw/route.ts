import { cpRoute, Params } from "@/app/lib/candidate-portal/core";
import { withdrawApplication } from "@/app/lib/candidate-portal/applications";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { reason: ACCEPTED_OTHER_OFFER|LOCATION|COMPENSATION|SCHEDULE|PERSONAL|OTHER, note? } -> refreshed application
export async function POST(
  request: NextRequest,
  context: Params<{ id: string }>,
) {
  return cpRoute(request, { auth: true, json: true }, async (c) =>
    withdrawApplication(c.account!, (await context.params).id, c.body),
  );
}
