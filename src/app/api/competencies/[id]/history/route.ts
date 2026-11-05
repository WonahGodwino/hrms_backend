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

// GET /api/competencies/:id/history?limit=20&cursor=<historyId>
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const { id } = params;

    const competency = await prisma.competency.findUnique({
      where: { id },
      select: { id: true, name: true, companyId: true },
    });
    if (!competency) {
      return withCors(ApiResponse.error("Competency not found", 404), origin);
    }

    const hasAccess = await verifyCompanyAccess(user, competency.companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit"));
    const limit =
      Number.isInteger(limitParam) && limitParam > 0
        ? Math.min(limitParam, 100)
        : 20;
    const cursor = searchParams.get("cursor") || undefined;

    // Fetch one extra row to know whether another page exists
    const rows = await prisma.competencyHistory.findMany({
      where: { competencyId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        action: true,
        createdAt: true,
        previousData: true,
        newData: true,
        actor: { select: { firstName: true, lastName: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const items = page.map((h) => ({
      id: h.id,
      action: h.action,
      label: formatActivityLabel(h.action, competency.name),
      detail: describeHistoryChange(h.action, h.previousData, h.newData),
      actor: h.actor ? `${h.actor.firstName} ${h.actor.lastName}` : "Unknown",
      date: h.createdAt, // ISO string once serialized; the frontend formats it
    }));

    return withCors(
      ApiResponse.success(
        { items, nextCursor: hasMore ? page[page.length - 1].id : null },
        "Competency history fetched successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
