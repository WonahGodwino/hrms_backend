import { cpRoute, CpResult } from "@/app/lib/candidate-portal/core";
import {
  listApplications,
  applyWithProfile,
} from "@/app/lib/candidate-portal/applications";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
import { linkByEmail } from "@/app/lib/candidate-portal/auth";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET handler, before listApplications:
export async function GET(request: NextRequest) {
  return cpRoute(request, { auth: true }, async (c) => {
    if (c.account!.emailVerifiedAt) await linkByEmail(c.account!.id, c.account!.email);
    return listApplications(c.account!.id, new URL(c.request.url).searchParams);
  });
}
// POST { jobId, coverLetterDocumentId? }  one-click apply with the profile and the resume slot
export async function POST(request: NextRequest) {
  return cpRoute(
    request,
    { auth: true, json: true },
    async (c) =>
      new CpResult(
        await applyWithProfile(c.account!, c.body),
        "Application submitted",
        201,
      ),
  );
}
