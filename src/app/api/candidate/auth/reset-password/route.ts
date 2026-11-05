import { cpRoute } from "@/app/lib/candidate-portal/core";
import { resetPassword } from "@/app/lib/candidate-portal/auth";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { token, newPassword, confirmPassword }
export async function POST(request: NextRequest) {
  return cpRoute(request, { json: true }, (c) => resetPassword(c.body, c.ip));
}
