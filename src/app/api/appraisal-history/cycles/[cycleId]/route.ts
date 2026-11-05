import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { RouteContext } from "@/app/lib/self-appraisal";
import { authorizeSelf, cycleDetail } from "@/app/lib/appraisal-history";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-history/cycles/:cycleId?companyId=...
// Scores, comments and feedback are only returned once the cycle is released (released: true).
export async function GET(
  request: NextRequest,
  context: RouteContext<{ cycleId: string }>,
) {
  const origin = request.headers.get("origin");
  try {
    const auth = await authorizeSelf(request, origin);
    if ("response" in auth) return auth.response;
    const { cycleId } = await context.params;

    const detail = await cycleDetail(auth.companyId, auth.self, cycleId);
    if (!detail)
      return withCors(
        ApiResponse.error("Appraisal cycle not found", 404),
        origin,
      );
    return withCors(
      ApiResponse.success(detail, "Appraisal cycle retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
