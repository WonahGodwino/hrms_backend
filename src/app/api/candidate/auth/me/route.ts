import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { cpRoute } from "@/app/lib/candidate-portal/core";
import { getMe } from "@/app/lib/candidate-portal/auth";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// GET -> account
export async function GET(request: NextRequest) {
  return cpRoute(request, { auth: true }, (c) => getMe(c.account!));
}
