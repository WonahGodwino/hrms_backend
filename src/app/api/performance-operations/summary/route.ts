import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { loadCycleForOps } from "@/app/lib/performance-operations/ops-utils";
import type { CycleForOps } from "@/app/lib/performance-operations/ops-utils";
import {
  buildControlsSummary,
  resolveOpsCycle,
} from "@/app/lib/performance-operations/ops-insights-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/performance-operations/summary?companyId&cycleId?
// Tiny feed for the header badges in PerformanceOpsTopControls:
//   { cycle, activeCycles, completionPct, pendingActions }
// COUNT queries only (no participant load). When the company has no cycles at
// all this returns 200 with cycle: null, so the header renders quietly.
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

    let cycle: CycleForOps | null = null;
    if (cycleId) {
      cycle = await loadCycleForOps(cycleId, companyId);
      if (!cycle)
        return withCors(
          ApiResponse.notFound("Appraisal cycle not found"),
          origin,
        );
    } else {
      // No cycleId: use the Workspace default; "no cycles" is not an error here.
      const resolved = await resolveOpsCycle(companyId, null);
      if (!("error" in resolved)) cycle = resolved.cycle;
    }

    return withCors(
      ApiResponse.success(
        await buildControlsSummary(companyId, cycle),
        "Summary retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
