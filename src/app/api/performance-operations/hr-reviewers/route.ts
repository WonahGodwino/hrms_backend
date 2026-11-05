import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  HR_REVIEWER_ROLES,
  fullName,
} from "@/app/lib/performance-operations/ops-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/performance-operations/hr-reviewers?companyId=...
// Backs EscalationActionModal's "Assigned HR Reviewer" select, replacing the
// hardcoded names. isCurrentUser lets the UI preselect "Self (Current Admin)".
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

    const staff = await prisma.staffRecord.findMany({
      where: { companyId, isActive: true, role: { in: HR_REVIEWER_ROLES } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        email: true,
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    const result = staff.map((s) => ({
      id: s.id,
      name: fullName(s),
      position: s.position,
      isCurrentUser: s.email === user.email,
    }));

    return withCors(
      ApiResponse.success(result, "HR reviewers retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
