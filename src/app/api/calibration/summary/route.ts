import { NextRequest } from "next/server";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  assertCalibrationOpen,
  buildCalibrationSummary,
  ensureCalibrationRecords,
  resolveCalibrationCycle,
  resolveCalibrator,
  NO_ACTIVE_CYCLE_MESSAGE,
  isNoActiveCycle,
  emptyCalibrationSummary,
} from "@/app/lib/calibration";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/calibration/summary?companyId=...&cycleId=... (cycleId optional)
// HR / ADMIN / SUPER_ADMIN only.
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

    const { actor } = await resolveCalibrator(user, companyId);
    if (!actor.companyWide)
      return withCors(
        ApiResponse.error("Only HR or admin users can access calibration", 403),
        origin,
      );

    const resolved = await resolveCalibrationCycle(
      companyId,
      searchParams.get("cycleId"),
    );
    if ("error" in resolved) {
      if (isNoActiveCycle(resolved))
        return withCors(
          ApiResponse.success(
            {
              ...emptyCalibrationSummary(),
              noActiveCycle: true,
              message: NO_ACTIVE_CYCLE_MESSAGE,
            },
            NO_ACTIVE_CYCLE_MESSAGE,
          ),
          origin,
        );
      return withCors(
        ApiResponse.error(resolved.error, resolved.status),
        origin,
      );
    }
    const { cycle } = resolved;

    // Same backfill the list endpoint runs, so the first dashboard load isn't empty
    if (assertCalibrationOpen(cycle) === null)
      await ensureCalibrationRecords(companyId, cycle.id);

    return withCors(
      ApiResponse.success(
        await buildCalibrationSummary(companyId, cycle),
        "Calibration summary retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
