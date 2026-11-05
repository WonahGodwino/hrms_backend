import { cpRoute } from "@/app/lib/candidate-portal/core";
import { forgotPassword } from "@/app/lib/candidate-portal/auth";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { email } -> always { sent: true }
export async function POST(request: NextRequest) {
  return cpRoute(request, { json: true }, (c) => forgotPassword(c.body, c.ip));
}
