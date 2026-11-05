import { cpRoute, CpResult, httpErr } from "@/app/lib/candidate-portal/core";
import { listSavedJobs, saveJob } from "@/app/lib/candidate-portal/alerts";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
export async function GET(request: NextRequest) {
  return cpRoute(request, { auth: true }, (c) => listSavedJobs(c.account!.id));
}
// POST { jobId }
export async function POST(request: NextRequest) {
  return cpRoute(request, { auth: true, json: true }, async (c) => {
    if (typeof c.body.jobId !== "string")
      throw httpErr(400, "jobId is required");
    return new CpResult(
      await saveJob(c.account!.id, c.body.jobId),
      "Job saved",
      201,
    );
  });
}
