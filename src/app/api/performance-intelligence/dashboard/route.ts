import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  authorizeSuper,
  buildDashboard,
} from "@/app/lib/performance-intelligence/intel-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/performance-intelligence/dashboard?companyId&cycleId?&months?
// One payload for every section; all of it is computed from one snapshot of the cycle.
// cycleId defaults to the latest completed cycle (else the latest live one).
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorizeSuper(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const months = Math.min(
      60,
      Math.max(3, Number(searchParams.get("months")) || 18),
    );
    const result = await buildDashboard(
      a.auth.companyId,
      searchParams.get("cycleId"),
      { trendMonths: months },
    );
    if ("error" in result)
      return withCors(ApiResponse.error(result.error, result.status), origin);
    return withCors(
      ApiResponse.success(result.data, "Dashboard retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}