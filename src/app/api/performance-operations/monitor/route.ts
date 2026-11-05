import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext, resolveActorStaffId } from "@/app/lib/access-control";
import {
  buildMonitorFeed,
  loadOpsSnapshot,
  resolveOpsCycle,
} from "@/app/lib/performance-operations/ops-insights-utils";
import { loadPipEscalationItems } from "@/app/lib/pip-ops";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/performance-operations/monitor?companyId&cycleId?
// Backs EnterpriseWorkflowMonitor. Item types:
//   OVERDUE_ENTITY | CALIBRATION_SKEW | ESCALATION | POLICY_EXCEPTION
// `actionableCount` is the full count; `items` is capped (see `truncated`).
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
    const actorId = await resolveActorStaffId(user, companyId);
    const [feed, pip] = await Promise.all([
      buildMonitorFeed(snapshot, { actorId, role: user.role }),
      loadPipEscalationItems(companyId),
    ]);
    return withCors(
      ApiResponse.success(
        {
          ...feed,
          pipEscalations: pip.items,
          pipEscalationCount: pip.total,
          pipEscalationsTruncated: pip.truncated,
        },
        "Monitor feed retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
