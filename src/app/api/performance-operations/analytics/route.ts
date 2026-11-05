import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  buildOrgAnalytics,
  loadOpsSnapshot,
  resolveOpsCycle,
} from "@/app/lib/performance-operations/ops-insights-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/performance-operations/analytics?companyId&cycleId?
// Backs OrganizationalAnalytics (all three tabs in one response):
//   heatmap      per-department KPI avg / completion / engagement
//   distribution High / Average / Low / PIP counts (same rules as the Hero)
//   managers     On Track / Delayed / Inactive counts + review velocity list
// Read-only. cycleId defaults like the Workspace (most recent live cycle).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const cycleId = searchParams.get("cycleId");
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required parameter: companyId", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const resolved = await resolveOpsCycle(companyId, cycleId);
    if ("error" in resolved)
      return withCors(
        ApiResponse.error(resolved.error, resolved.status),
        origin,
      );

    const snapshot = await loadOpsSnapshot(resolved.cycle, companyId);
    return withCors(
      ApiResponse.success(
        await buildOrgAnalytics(snapshot),
        "Analytics retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
