import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  AnalyticsRange,
  buildAnalytics,
  enumOf,
  resolveSelf,
} from "@/app/lib/feedback";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/feedback/analytics?companyId=...&range=12m|6m|ytd (default 12m)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(authHeader.replace("Bearer ", ""), [
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    const range = searchParams.get("range") ?? "12m";
    if (!enumOf(["12m", "6m", "ytd"] as const, range))
      return withCors(
        ApiResponse.error("range must be 12m, 6m or ytd", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    const self = await resolveSelf(user, companyId);
    if (!self)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    return withCors(
      ApiResponse.success(
        await buildAnalytics(self, companyId, range as AnalyticsRange),
        "Feedback analytics retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
