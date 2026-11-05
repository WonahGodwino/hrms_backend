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
import { average } from "@/app/lib/goals/analytics-utils";
import { VALID_PERFORMANCE_CATEGORIES } from "@/app/lib/goals/goal-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const SUBJECT_LABELS: Record<string, string> = {
  PRODUCTIVITY: "Productivity",
  QUALITY: "Quality",
  COLLABORATION: "Collaboration",
  TIMELINESS: "Timeliness",
  INNOVATION: "Innovation",
  LEADERSHIP: "Leadership",
};

// ---------------------------------------------------------------------------
// GET /api/goals/analytics/categories?companyId=&staffRecordId=
// Backs AnalyticsSection's Category Breakdown bar chart. Score per category
// = average current Goal.progress across that staff's non-archived goals
// tagged with that performanceCategory. A category with no tagged goals
// returns score: 0 (rendered as an empty/zero bar, not omitted — all six
// categories always appear so the chart's shape stays consistent).
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

    const goals = await prisma.goal.findMany({
      where: {
        companyId,
        staffRecordId,
        isArchived: false,
        performanceCategory: { not: null },
      },
      select: { performanceCategory: true, progress: true },
    });

    const categories = VALID_PERFORMANCE_CATEGORIES.map((cat) => {
      const scores = goals
        .filter((g) => g.performanceCategory === cat)
        .map((g) => g.progress);
      return {
        subject: SUBJECT_LABELS[cat],
        category: cat,
        score: average(scores) ?? 0,
        fullMark: 100,
      };
    });

    return withCors(
      ApiResponse.success(
        { categories },
        "Category breakdown retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
