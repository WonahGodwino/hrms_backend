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
// GET /api/review-templates/:id/versions?companyId=...
// Lists every version of the template (DRAFT/ACTIVE/ARCHIVED/SUPERSEDED),
// newest first — backs the "Version History" timeline in TemplateDetailDrawer.
// Returns section/question counts rather than full nested content, since this
// is a list view; full content for a given version comes from GET /:id (for
// currentVersion) or could get its own /versions/:versionId route if a past
// version ever needs to be opened in full.
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
      select: { id: true, currentVersionId: true },
    });
    if (!template) {
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );
    }

    const versions = await prisma.reviewTemplateVersion.findMany({
      where: { templateId: template.id },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        status: true,
        description: true,
        publishedAt: true,
        publishedBy: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { sections: true } },
      },
    });

    const result = versions.map((v) => ({
      ...v,
      isCurrent: v.id === template.currentVersionId,
      sectionCount: v._count.sections,
      _count: undefined,
    }));

    return withCors(
      ApiResponse.success(result, "Versions retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
