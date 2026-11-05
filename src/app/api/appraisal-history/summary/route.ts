import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { authorizeSelf, buildSummary } from "@/app/lib/appraisal-history";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-history/summary?companyId=...
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const auth = await authorizeSelf(request, origin);
    if ("response" in auth) return auth.response;
    return withCors(
      ApiResponse.success(
        await buildSummary(auth.companyId, auth.self),
        "Appraisal history summary retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
