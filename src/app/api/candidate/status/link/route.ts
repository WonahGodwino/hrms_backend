import { cpRoute } from "@/app/lib/candidate-portal/core";
import { linkLookup } from "@/app/lib/candidate-portal/status";
import { NextRequest } from "next/server";
import { handleCorsOptions } from "@/app/lib/cors";
export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}
// POST { grant } -> { linked, alreadyLinked, conflicts }   (signed in; grant comes from status/verify)
export async function POST(request: NextRequest) {
  return cpRoute(request, { auth: true, json: true }, (c) =>
    linkLookup(c.account!, c.body),
  );
}
