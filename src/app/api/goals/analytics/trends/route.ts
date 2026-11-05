import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  getStaffRecordIdFromEmail,
} from "@/app/lib/access-control";
import { buildMonthBuckets, average } from "@/app/lib/goals/analytics-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const VALID_RANGES: Record<string, number> = { "3": 3, "6": 6, "12": 12 };

// ---------------------------------------------------------------------------
// GET /api/goals/analytics/trends?companyId=&staffRecordId=&months=3|6|12
// Backs AnalyticsSection's Progress Trends chart. "performance" = the target
// staff's own average progress-update value per month. "benchmark" = the
// average across their department (excluding themselves) for the same
// months. A month with no progress updates returns null for that series so
// the frontend can render a gap rather than a misleading 0.
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
      "STAFF",
      "MANAGER",
      "HR",
      "ADMIN",
      "SUPER_ADMIN",
    ]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    let staffRecordId = searchParams.get("staffRecordId");
    const monthsParam = searchParams.get("months") ?? "6";

    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (!VALID_RANGES[monthsParam]) {
      return withCors(
        ApiResponse.error("Invalid months. Must be one of: 3, 6, 12", 400),
        origin,
      );
    }
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    if (["STAFF", "MANAGER"].includes(user.role)) {
      const ownId = await getStaffRecordIdFromEmail(user.email);
      if (!ownId)
        return withCors(
          ApiResponse.error("No staff record found for this user", 403),
          origin,
        );
      staffRecordId = ownId;
    }
    if (!staffRecordId)
      return withCors(
        ApiResponse.error("Missing required param: staffRecordId", 400),
        origin,
      );

    const staff = await prisma.staffRecord.findFirst({
      where: { id: staffRecordId, companyId },
      select: { id: true, departmentId: true },
    });
    if (!staff)
      return withCors(ApiResponse.notFound("Staff record not found"), origin);

    const months = VALID_RANGES[monthsParam];
    const buckets = buildMonthBuckets(months);
    const rangeStart = buckets[0].start;

    const [ownUpdates, deptStaffIds] = await Promise.all([
      prisma.goalProgressUpdate.findMany({
        where: {
          createdAt: { gte: rangeStart },
          goal: { staffRecordId: staff.id, companyId },
        },
        select: { progress: true, createdAt: true },
      }),
      staff.departmentId
        ? prisma.staffRecord.findMany({
            where: {
              companyId,
              departmentId: staff.departmentId,
              id: { not: staff.id },
            },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);

    const benchmarkUpdates = deptStaffIds.length
      ? await prisma.goalProgressUpdate.findMany({
          where: {
            createdAt: { gte: rangeStart },
            goal: {
              staffRecordId: { in: deptStaffIds.map((s) => s.id) },
              companyId,
            },
          },
          select: { progress: true, createdAt: true },
        })
      : [];

    const trend = buckets.map((b) => {
      const ownInBucket = ownUpdates
        .filter((u) => u.createdAt >= b.start && u.createdAt < b.end)
        .map((u) => u.progress);
      const benchInBucket = benchmarkUpdates
        .filter((u) => u.createdAt >= b.start && u.createdAt < b.end)
        .map((u) => u.progress);
      return {
        month: b.label,
        performance: average(ownInBucket),
        benchmark: average(benchInBucket),
      };
    });

    return withCors(
      ApiResponse.success({ trend, months }, "Trends retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
