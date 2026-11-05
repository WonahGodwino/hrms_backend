import { cpRoute, Params } from "@/app/lib/candidate-portal/core";
import { unsaveJob } from "@/app/lib/candidate-portal/alerts";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
export async function DELETE(
  request: NextRequest,
  context: Params<{ jobId: string }>,
) {
  return cpRoute(request, { auth: true }, async (c) =>
    unsaveJob(c.account!.id, (await context.params).jobId),
  );
}
