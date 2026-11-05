import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/appraisal-cycles/reviewer-departments?companyId=&search=
// Backs ReviewerAssignmentModal's department list — real manager names and
// live headcounts (counted from StaffRecord, not the possibly-stale
// Department.activeHeadcount column).
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
    const search = searchParams.get("search")?.trim();

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

    const departments = await prisma.department.findMany({
      where: {
        companyId,
        status: "Active",
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                {
                  head: {
                    firstName: { contains: search, mode: "insensitive" },
                  },
                },
                {
                  head: { lastName: { contains: search, mode: "insensitive" } },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        head: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { staff: { where: { isActive: true } } } },
      },
      orderBy: { name: "asc" },
    });

    const result = departments.map((d) => ({
      id: d.id,
      name: d.name,
      manager: d.head ? `${d.head.firstName} ${d.head.lastName}` : "Unassigned",
      employees: d._count.staff,
    }));

    return withCors(
      ApiResponse.success(result, "Departments retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
