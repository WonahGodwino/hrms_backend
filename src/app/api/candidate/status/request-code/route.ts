import { cpRoute } from "@/app/lib/candidate-portal/core";
import { requestStatusCode } from "@/app/lib/candidate-portal/status";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { email? , referenceCode? } -> always { sent: true }
export async function POST(request: NextRequest) {
  return cpRoute(request, { json: true }, (c) =>
    requestStatusCode(c.body, c.ip),
  );
}
