import { cpRoute, CpResult } from "@/app/lib/candidate-portal/core";
import { createEducation } from "@/app/lib/candidate-portal/profile";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { institution, degree, fieldOfStudy?, startYear?, endYear?, grade? }
export async function POST(request: NextRequest) {
  return cpRoute(
    request,
    { auth: true, json: true },
    async (c) =>
      new CpResult(
        await createEducation(c.account!.id, c.body),
        "Education added",
        201,
      ),
  );
}
