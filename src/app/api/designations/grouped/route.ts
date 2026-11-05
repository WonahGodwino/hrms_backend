import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { getUserFromToken } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { resolveScopedCompanyId } from "@/app/lib/company-scope";

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}

// GET /api/designations/grouped?companyId=
// Returns Active designations grouped by department name, shaped for the
// RoleMappingModal's sidebar/grid UI — separate from GET /api/designations,
// which stays unchanged for the paginated designation-management list view.
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const token =
      req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
    if (!token)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );

    const user = await getUserFromToken(token);
    if (!user) return withCors(ApiResponse.error("Invalid token", 401), origin);

    const { searchParams } = new URL(req.url);
    const scope = await resolveScopedCompanyId(
      user as any,
      searchParams.get("companyId"),
    );
    if (scope.forbidden)
      return withCors(
        ApiResponse.error("You do not have access to this company", 403),
        origin,
      );
    const companyId = scope.companyId;

    if (!companyId) {
      return withCors(
        ApiResponse.error(
          "companyId is required (or could not be resolved for this user)",
          400,
        ),
        origin,
      );
    }

    const designations = await (prisma as any).designation.findMany({
      where: { companyId, status: "Active" },
      select: {
        id: true,
        title: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { title: "asc" },
    });

    const grouped = designations.reduce(
      (acc: Record<string, any[]>, d: any) => {
        const deptName = d.department?.name || "Unassigned";
        if (!acc[deptName]) acc[deptName] = [];
        acc[deptName].push({ id: d.id, title: d.title });
        return acc;
      },
      {},
    );

    return withCors(
      ApiResponse.success(
        grouped,
        "Designations grouped by department fetched successfully",
      ),
      origin,
    );
  } catch (e) {
    return withCors(handleApiError(e), origin);
  }
}
