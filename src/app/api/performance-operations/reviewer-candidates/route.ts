import { NextRequest } from "next/server";
import prisma from "@/app/lib/prisma";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import {
  verifyCompanyAccess,
  UserContext,
  resolveActorStaffId,
} from "@/app/lib/access-control";
import { REVIEWER_ELIGIBLE_ROLES } from "@/app/lib/performance-operations/ops-actions-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const MAX_CANDIDATES = 200;

// ---------------------------------------------------------------------------
// GET /api/performance-operations/reviewer-candidates?companyId&search?
// Active MANAGER / HR / ADMIN / SUPER_ADMIN staff, for the Reassign Reviewer
// select in BulkOperationsModal. (GET /hr-reviewers only returns HR/Admin, so
// line managers could never be chosen there.) The same role set is enforced
// by the REASSIGN_REVIEWER action. Returns a plain array.
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
    const search = (searchParams.get("search") ?? "").trim().slice(0, 100);
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required parameter: companyId", 400),
        origin,
      );

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    // Read-only: an unresolved actor just means isCurrentUser is false.
    const actorId = await resolveActorStaffId(user, companyId);

    const rows = await prisma.staffRecord.findMany({
      where: {
        companyId,
        isActive: true,
        role: { in: REVIEWER_ELIGIBLE_ROLES },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" as const } },
                { lastName: { contains: search, mode: "insensitive" as const } },
                { staffId: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: MAX_CANDIDATES,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        position: true,
        email: true,
        role: true,
        departments: { select: { name: true } },
      },
    });

    return withCors(
      ApiResponse.success(
        rows.map((r) => ({
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          position: r.position,
          email: r.email,
          role: r.role,
          department: r.departments?.name ?? null,
          isCurrentUser: r.id === actorId,
        })),
        "Reviewer candidates retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
