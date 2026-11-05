import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { cpRoute } from "@/app/lib/candidate-portal/core";
import { resendVerification } from "@/app/lib/candidate-portal/auth";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
export async function POST(request: NextRequest) {
  return cpRoute(request, { auth: true }, (c) =>
    resendVerification(c.account!),
  );
}
