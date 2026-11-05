import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { cpRoute } from "@/app/lib/candidate-portal/core";
import { verifyEmail } from "@/app/lib/candidate-portal/auth";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { code } -> { verified, linked }   (linked = existing applications attached to this account)
export async function POST(request: NextRequest) {
  return cpRoute(request, { auth: true, json: true }, (c) =>
    verifyEmail(c.account!, c.body),
  );
}
