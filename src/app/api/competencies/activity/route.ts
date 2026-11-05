import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import {
  formatActivityLabel,
  describeHistoryChange,
} from "@/app/lib/competencies/competency-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/competencies/activity?companyId=xxx&limit=5
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);

    const companyId = request.nextUrl.searchParams.get("companyId");
    if (!companyId) {
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    }

    const limitParam = parseInt(
      request.nextUrl.searchParams.get("limit") ?? "",
      10,
    );
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 50)
        : 5;

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const entries = await prisma.competencyHistory.findMany({
      where: {
        OR: [
          { companyId },
          // older rows written before companyId was stored on history
          { companyId: null, competency: { companyId } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        action: true,
        createdAt: true,
        competencyId: true,
        previousData: true, // used server-side for the change summary, never returned
        newData: true,
        competency: { select: { name: true } },
        actor: { select: { firstName: true, lastName: true } },
      },
    });

    const activity = entries.map((entry) => ({
      id: entry.id,
      competencyId: entry.competencyId,
      label: formatActivityLabel(entry.action, entry.competency.name),
      detail: describeHistoryChange(
        entry.action,
        entry.previousData,
        entry.newData,
      ),
      meta: `by ${entry.actor.firstName} ${entry.actor.lastName} • ${entry.createdAt.toISOString()}`,
      action: entry.action,
      createdAt: entry.createdAt,
    }));

    return withCors(
      ApiResponse.success(activity, "Activity fetched successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
