import { NextRequest } from "next/server";
import { CalibrationStatus, Prisma } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  RECORD_SELECT,
  assertCalibrationOpen,
  buildRows,
  ensureCalibrationRecords,
  resolveCalibrationCycle,
  resolveCalibrator,
  buildRecordWhere,
  NO_ACTIVE_CYCLE_MESSAGE,
  isNoActiveCycle,
} from "@/app/lib/calibration";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/calibration/records?companyId=...
// Optional: cycleId, search (name / role / department / manager), departmentId,
//           status (PENDING|UNDER_REVIEW|ADJUSTED|APPROVED|ESCALATED|FINALIZED),
//           ids (comma-separated record ids, max 10, for the comparison modal),
//           limit (default 25, max 100), offset
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

    const { actor, isAdmin } = await resolveCalibrator(user, companyId);
    if (!actor.companyWide)
      return withCors(
        ApiResponse.error("Only HR or admin users can access calibration", 403),
        origin,
      );

    const status = searchParams.get("status");
    if (
      status &&
      !Object.values(CalibrationStatus).includes(status as CalibrationStatus)
    )
      return withCors(
        ApiResponse.error(
          `status must be one of: ${Object.values(CalibrationStatus).join(", ")}`,
          400,
        ),
        origin,
      );
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
      100,
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0,
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
              cycle: null,
              noActiveCycle: true,
              message: NO_ACTIVE_CYCLE_MESSAGE,
              totalCount: 0,
              count: 0,
              items: [],
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
    const cycleOpen = assertCalibrationOpen(cycle) === null;

    if (cycleOpen) await ensureCalibrationRecords(companyId, cycle.id);

    const where = buildRecordWhere(companyId, cycle.id, searchParams);
    const [rows, count, totalCount] = await Promise.all([
      prisma.calibrationRecord.findMany({
        where,
        select: RECORD_SELECT,
        orderBy: [
          { staffRecord: { firstName: "asc" } },
          { staffRecord: { lastName: "asc" } },
        ],
        skip: offset,
        take: limit,
      }),
      prisma.calibrationRecord.count({ where }),
      prisma.calibrationRecord.count({
        where: { companyId, cycleId: cycle.id },
      }),
    ]);

    return withCors(
      ApiResponse.success(
        {
          cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
          totalCount,
          count,
          items: await buildRows(rows, { companyId, isAdmin, cycleOpen }),
        },
        "Calibration records retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
