import { NextRequest, NextResponse } from "next/server";
import { CalibrationStatus } from "@prisma/client";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  RECORD_SELECT,
  assertCalibrationOpen,
  buildRecordWhere,
  buildRows,
  resolveCalibrationCycle,
  resolveCalibrator,
} from "@/app/lib/calibration";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const MAX_EXPORT_ROWS = 5000;

// Quotes values and neutralises spreadsheet formulas (= + - @ at the start)
const cell = (v: string | number | null | undefined) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /api/calibration/records/export?companyId=...
// Same filters as the list endpoint (cycleId, search, departmentId, status); returns text/csv.
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

    const resolved = await resolveCalibrationCycle(
      companyId,
      searchParams.get("cycleId"),
    );
    if ("error" in resolved)
      return withCors(
        ApiResponse.error(resolved.error, resolved.status),
        origin,
      );
    const { cycle } = resolved;

    const records = await prisma.calibrationRecord.findMany({
      where: buildRecordWhere(companyId, cycle.id, searchParams),
      select: RECORD_SELECT,
      orderBy: [
        { staffRecord: { firstName: "asc" } },
        { staffRecord: { lastName: "asc" } },
      ],
      take: MAX_EXPORT_ROWS,
    });
    const rows = await buildRows(records, {
      companyId,
      isAdmin,
      cycleOpen: assertCalibrationOpen(cycle) === null,
    });

    const header = [
      "Employee",
      "Role",
      "Level",
      "Department",
      "Manager",
      "Self score (1-5)",
      "Manager score (1-5)",
      "Final score (1-5)",
      "Original rating",
      "Proposed rating",
      "Status",
      "Adjustment reason",
      "Potential",
    ];
    const lines = rows.map((r) =>
      [
        r.name,
        r.role,
        r.level,
        r.dept,
        r.manager,
        r.scores.self,
        r.scores.manager,
        r.scores.final,
        r.calibration.current,
        r.calibration.proposed,
        r.calibration.status,
        r.adjustmentReason,
        r.potential,
      ]
        .map(cell)
        .join(","),
    );
    const csv = "\uFEFF" + [header.map(cell).join(","), ...lines].join("\r\n");

    return withCors(
      new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="calibration-${cycle.id}.csv"`,
        },
      }),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
