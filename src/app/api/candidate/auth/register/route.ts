import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { cpRoute, CpResult } from "@/app/lib/candidate-portal/core";
import { registerAccount } from "@/app/lib/candidate-portal/auth";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { firstName, lastName, email, password } -> { token, expiresAt, account, verificationRequired }
export async function POST(request: NextRequest) {
  return cpRoute(
    request,
    { json: true },
    async (c) =>
      new CpResult(await registerAccount(c.body, c.ip), "Account created", 201),
  );
}
