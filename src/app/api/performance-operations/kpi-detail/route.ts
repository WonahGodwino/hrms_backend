import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  VALID_KPI_KEYS,
  buildKpiDetail,
  loadOpsSnapshot,
  resolveOpsCycle,
} from "@/app/lib/performance-operations/ops-insights-utils";
import type { KpiKey } from "@/app/lib/performance-operations/ops-insights-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/performance-operations/kpi-detail
//   ?companyId&kpiKey=appraisal|workforce|participation|compliance&cycleId?
// Backs KpiDetailModal. Returns { kpiKey, summary, columns, rows, total,
// truncated }. `columns` drives both the table and the client-side CSV export.
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
    const rawKey = searchParams.get("kpiKey");
    if (!companyId || !rawKey)
      return withCors(
        ApiResponse.error(
          "Missing required parameters: companyId, kpiKey",
          400,
        ),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const kpiKey = rawKey.trim().toLowerCase() as KpiKey;
    if (!VALID_KPI_KEYS.includes(kpiKey))
      return withCors(
        ApiResponse.error(
          `Invalid kpiKey. Must be one of: ${VALID_KPI_KEYS.join(", ")}`,
          400,
        ),
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
        buildKpiDetail(snapshot, kpiKey),
        "KPI detail retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
