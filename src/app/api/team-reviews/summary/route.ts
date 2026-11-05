import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  buildTeamSummary,
  loadTeamRows,
  resolveActor,
  resolveCycle,
  scopeWhere,
} from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/team-reviews/summary?companyId=...&cycleId=... (cycleId optional)
// Feeds the header badges (reviewsProgress.pending / completionPct) and the
// Reviews Progress, Performance Distribution and Goal Achievement cards.
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

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const actor = await resolveActor(user, companyId);
    if (!actor.companyWide && !actor.staffRecordId)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const resolved = await resolveCycle(
      companyId,
      searchParams.get("cycleId"),
      scopeWhere(actor),
    );
    if ("error" in resolved)
      return withCors(
        ApiResponse.error(resolved.error, resolved.status),
        origin,
      );

    const rows = await loadTeamRows(companyId, resolved.cycle, actor);
    const summary = await buildTeamSummary(companyId, resolved.cycle, rows);

    return withCors(
      ApiResponse.success(
        summary,
        "Team review summary retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
