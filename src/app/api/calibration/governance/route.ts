import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  resolveCalibrationCycle,
  resolveCalibrator,
  NO_ACTIVE_CYCLE_MESSAGE,
  isNoActiveCycle,
} from "@/app/lib/calibration";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/calibration/governance?companyId=...&cycleId=... (cycleId optional)
// disputedRatings is null: there is no employee appeal feature yet.
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
              pendingExecutiveApproval: 0,
              outstandingReviews: 0,
              disputedRatings: null,
              noActiveCycle: true,
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
    const managerPhaseOn = cycle.phases.some(
      (p) => p.phaseType === "MANAGER_REVIEW" && p.enabled,
    );

    const [pendingExecutiveApproval, outstandingReviews] = await Promise.all([
      prisma.calibrationRecord.count({
        where: { companyId, cycleId: cycle.id, status: "ESCALATED" },
      }),
      managerPhaseOn
        ? prisma.appraisalCycleParticipant.count({
            where: {
              companyId,
              cycleId: cycle.id,
              phases: {
                none: { phaseType: "MANAGER_REVIEW", status: "COMPLETED" },
              },
            },
          })
        : Promise.resolve(0),
    ]);

    return withCors(
      ApiResponse.success(
        { pendingExecutiveApproval, outstandingReviews, disputedRatings: null },
        "Governance counts retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
