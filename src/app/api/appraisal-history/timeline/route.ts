import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { authorizeSelf, buildTimeline } from "@/app/lib/appraisal-history";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-history/timeline?companyId=...&limit=...&offset=... (default 20, max 50)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const auth = await authorizeSelf(request, origin);
    if ("response" in auth) return auth.response;
    const limit = Math.min(
      Math.max(parseInt(auth.searchParams.get("limit") ?? "20", 10) || 20, 1),
      50,
    );
    const offset = Math.max(
      parseInt(auth.searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    return withCors(
      ApiResponse.success(
        await buildTimeline(auth.companyId, auth.self, limit, offset),
        "Career timeline retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
