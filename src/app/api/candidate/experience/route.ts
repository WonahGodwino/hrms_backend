import { cpRoute, CpResult } from "@/app/lib/candidate-portal/core";
import { createExperience } from "@/app/lib/candidate-portal/profile";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { title, company, employmentType?, startDate, endDate?, isCurrent?, description? }
export async function POST(request: NextRequest) {
  return cpRoute(
    request,
    { auth: true, json: true },
    async (c) =>
      new CpResult(
        await createExperience(c.account!.id, c.body),
        "Experience added",
        201,
      ),
  );
}
