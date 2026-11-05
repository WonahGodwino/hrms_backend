import { cpRoute } from "@/app/lib/candidate-portal/core";
import { savedJobIds } from "@/app/lib/candidate-portal/alerts";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// GET -> { ids: [jobId] }   drives the bookmark state on the jobs board and details page
export async function GET(request: NextRequest) {
  return cpRoute(request, { auth: true }, (c) => savedJobIds(c.account!.id));
}
