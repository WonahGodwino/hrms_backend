import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  STAGES,
  STAGE_TITLES,
  Stage,
  loadTeamRows,
  matchesFilters,
  parseBoardFilters,
  resolveActor,
  resolveCycle,
  scopeWhere,
} from "@/app/lib/manager-review";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/team-reviews?companyId=...
// Optional: cycleId, search, departmentId, score (GT_90|GT_75|LT_60),
//           risk (HIGH|MEDIUM|STABLE), status (COMPLETED|PENDING_REVIEW|OVERDUE),
//           limit (per column, default 25, max 100),
//           stage + offset (to load more of ONE column)
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

    const parsed = parseBoardFilters(searchParams);
    if ("error" in parsed)
      return withCors(ApiResponse.error(parsed.error, 400), origin);

    const stageParam = searchParams.get("stage");
    if (stageParam && !(STAGES as readonly string[]).includes(stageParam))
      return withCors(
        ApiResponse.error(`stage must be one of: ${STAGES.join(", ")}`, 400),
        origin,
      );
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
      100,
    );
    const offset = stageParam
      ? Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0)
      : 0;

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
    if ("error" in resolved) {
      // No active cycle is a normal state: return the four empty stage columns
      if (!searchParams.get("cycleId") && resolved.status === 404)
        return withCors(
          ApiResponse.success(
            {
              cycle: null,
              noActiveCycle: true,
              message: "There is no active review cycle yet.",
              total: 0,
              columns: STAGES.filter(
                (s) => !stageParam || s === stageParam,
              ).map((stage: Stage) => ({
                stage,
                title: STAGE_TITLES[stage],
                count: 0,
                items: [],
              })),
            },
            "No active review cycle",
          ),
          origin,
        );
      return withCors(
        ApiResponse.error(resolved.error, resolved.status),
        origin,
      );
    }
    const { cycle } = resolved;

    const rows = (
      await loadTeamRows(companyId, cycle, actor, parsed.filters)
    ).filter((r) => matchesFilters(r, parsed.filters));

    const columns = STAGES.filter((s) => !stageParam || s === stageParam).map(
      (stage: Stage) => {
        const inStage = rows.filter((r) => r.stage === stage);
        return {
          stage,
          title: STAGE_TITLES[stage],
          count: inStage.length,
          items: inStage.slice(offset, offset + limit),
        };
      },
    );

    return withCors(
      ApiResponse.success(
        {
          cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
          total: rows.length,
          columns,
        },
        "Team reviews retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
