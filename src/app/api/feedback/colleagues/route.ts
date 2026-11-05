import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { PERSON_SELECT, resolveSelf, toPerson } from "@/app/lib/feedback";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/feedback/colleagues?companyId=...&search=... (limit default 20, max 50)
// Active colleagues in the company, excluding the caller.
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const user: UserContext = requireRole(authHeader.replace("Bearer ", ""), [
      "STAFF",
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
    const self = await resolveSelf(user, companyId);
    if (!self)
      return withCors(
        ApiResponse.error("No staff record is linked to this account", 403),
        origin,
      );

    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      50,
    );
    const tokens = (searchParams.get("search") ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5);

    const rows = await prisma.staffRecord.findMany({
      where: {
        companyId,
        isActive: true,
        id: { not: self.id },
        AND: tokens.map((tk) => {
          const c = { contains: tk, mode: "insensitive" as const };
          return {
            OR: [
              { firstName: c },
              { lastName: c },
              { position: c },
              { staffId: c },
            ],
          };
        }),
      },
      select: PERSON_SELECT,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: limit,
    });
    return withCors(
      ApiResponse.success(
        rows.map(toPerson),
        "Colleagues retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
