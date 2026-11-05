import { cpRoute, Params } from "@/app/lib/candidate-portal/core";
import { getApplication } from "@/app/lib/candidate-portal/applications";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
export async function GET(
  request: NextRequest,
  context: Params<{ id: string }>,
) {
  return cpRoute(request, { auth: true }, async (c) =>
    getApplication(c.account!.id, (await context.params).id),
  );
}
