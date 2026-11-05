import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { authorizeSelf, buildCompare } from "@/app/lib/appraisal-history";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-history/compare?companyId=...&cycleId=...&againstCycleId=... (againstCycleId optional)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const auth = await authorizeSelf(request, origin);
    if ("response" in auth) return auth.response;
    const cycleId = auth.searchParams.get("cycleId");
    if (!cycleId)
      return withCors(
        ApiResponse.error("Missing required query param: cycleId", 400),
        origin,
      );

    const result = await buildCompare(
      auth.companyId,
      auth.self,
      cycleId,
      auth.searchParams.get("againstCycleId"),
    );
    if ("error" in result)
      return withCors(ApiResponse.error(result.error, result.status), origin);
    return withCors(
      ApiResponse.success(result.data, "Comparison retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
