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
// GET /api/review-templates/:id/history?companyId=...&page=&limit=
// Full audit trail for the template (CREATED, EDITED, PUBLISHED, DUPLICATED,
// ARCHIVED, etc.), newest first — feeds the Audit & Compliance screen and any
// future "activity" panel on the template detail view.
// ---------------------------------------------------------------------------
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
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
    );

    if (!companyId) {
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    }

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const template = await prisma.reviewTemplate.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!template) {
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );
    }

    const [entries, total] = await prisma.$transaction([
    prisma.templateHistory.findMany({
        where: { templateId: template.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
        actor: { select: { id: true, firstName: true, lastName: true } },
        },
    }),
    prisma.templateHistory.count({ where: { templateId: template.id } }),
    ]);

    return withCors(
      ApiResponse.success(
        { entries, pagination: { page, limit, total } },
        "History retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
