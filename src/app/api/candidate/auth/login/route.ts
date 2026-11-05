import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { cpRoute } from "@/app/lib/candidate-portal/core";
import { loginAccount } from "@/app/lib/candidate-portal/auth";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { email, password, remember? } -> { token, expiresAt, account }
export async function POST(request: NextRequest) {
  return cpRoute(request, { json: true }, (c) => loginAccount(c.body, c.ip));
}
