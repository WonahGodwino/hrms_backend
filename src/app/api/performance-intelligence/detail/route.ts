import { NextRequest } from "next/server";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  authorizeSuper,
  buildDetail,
} from "@/app/lib/performance-intelligence/intel-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/performance-intelligence/detail?companyId&type&id&cycleId?
// type: KPI | BUSINESS_UNIT | DEPARTMENT | HEATMAP_CELL ("{deptKey}:{METRIC}") | MANAGER |
//       NINE_BOX ("HIGH:HIGH" or "FAST_TRACK") | RISK_ITEM ("dept:{key}" or "escalation:{id}") |
//       SUCCESSION_BUCKET (a readiness value)
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const { searchParams } = new URL(request.url);
    const a = await authorizeSuper(request, searchParams.get("companyId"));
    if (!a.ok) return a.response;
    const result = await buildDetail(
      a.auth.companyId,
      searchParams.get("cycleId"),
      (searchParams.get("type") ?? "").toUpperCase(),
      searchParams.get("id") ?? "",
    );
    if ("error" in result)
      return withCors(ApiResponse.error(result.error, result.status), origin);
    return withCors(
      ApiResponse.success(result.data, "Detail retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}