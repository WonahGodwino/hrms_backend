import { cpRoute } from "@/app/lib/candidate-portal/core";
import { getProfile, updateProfile } from "@/app/lib/candidate-portal/profile";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// GET -> { account, experiences, educations, documents, completeness }
export async function GET(request: NextRequest) {
  return cpRoute(request, { auth: true }, (c) => getProfile(c.account!.id));
}
// PUT { firstName?, lastName?, phone?, headline?, locationState?, locationLga?, linkedInUrl?, portfolioUrl? }
export async function PUT(request: NextRequest) {
  return cpRoute(request, { auth: true, json: true }, (c) =>
    updateProfile(c.account!.id, c.body),
  );
}
