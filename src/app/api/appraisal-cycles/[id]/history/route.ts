import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { clampInt } from "@/app/lib/appraisal-cycles/appraisal-cycle-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-cycles/:id/history?companyId=&page=&limit=
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const page = clampInt(searchParams.get("page"), 1, 1, 10_000);
    const limit = clampInt(searchParams.get("limit"), 20, 1, 100);

    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const [entries, total] = await prisma.$transaction([
      prisma.appraisalCycleHistory.findMany({
        where: { cycleId: cycle.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.appraisalCycleHistory.count({ where: { cycleId: cycle.id } }),
    ]);

    return withCors(
      ApiResponse.success(
        {
          entries,
          pagination: { page, limit, total, hasMore: page * limit < total },
        },
        "History retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
