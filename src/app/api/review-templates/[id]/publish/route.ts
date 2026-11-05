import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  logTemplateAction,
  validateSectionWeights,
  getPublishBlockers
} from "@/app/lib/review-templates/review-template-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// POST /api/review-templates/:id/publish
// body: { versionId, companyId }
// Validates section weights sum to 100, promotes the DRAFT version to ACTIVE,
// supersedes whatever version was previously ACTIVE (if any), and repoints
// template.currentVersionId at the newly-published version.
// ---------------------------------------------------------------------------
export async function POST(
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
    const body = await request.json();
    const { versionId, companyId } = body;

    if (!versionId || !companyId) {
      return withCors(
        ApiResponse.error("Missing required fields: versionId, companyId", 400),
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
    });
    if (!template) {
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );
    }

    const version = await prisma.reviewTemplateVersion.findFirst({
      where: { id: versionId, templateId: template.id },
      include: { sections: { select: { weight: true } } },
    });
    if (!version) {
      return withCors(
        ApiResponse.notFound("Version not found on this template"),
        origin,
      );
    }

    if (version.status !== "DRAFT") {
      return withCors(
        ApiResponse.error(
          `Only a DRAFT version can be published. Current status: ${version.status}`,
          400,
        ),
        origin,
      );
    }

    if (!version.sections.length) {
      return withCors(
        ApiResponse.error("Cannot publish a version with no sections", 400),
        origin,
      );
    }

    const blockers = await getPublishBlockers(prisma, version.id);
    if (blockers.length > 0) {
      return withCors(
        ApiResponse.error(`Cannot publish yet: ${blockers.join(" ")}`, 400),
        origin,
      );
    }

    const { valid, total } = validateSectionWeights(version.sections);
    if (!valid) {
      return withCors(
        ApiResponse.error(
          `Section weights must sum to 100. Current total: ${total}`,
          400,
        ),
        origin,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Supersede whatever was previously ACTIVE on this template, if anything.
      const previouslyActive = await tx.reviewTemplateVersion.findFirst({
        where: { templateId: template.id, status: "ACTIVE" },
      });

      if (previouslyActive) {
        await tx.reviewTemplateVersion.update({
          where: { id: previouslyActive.id },
          data: { status: "SUPERSEDED" },
        });
      }

      const publishedVersion = await tx.reviewTemplateVersion.update({
        where: { id: version.id },
        data: {
          status: "ACTIVE",
          publishedAt: new Date(),
          publishedBy: user.userId,
        },
      });

      await tx.reviewTemplate.update({
        where: { id: template.id },
        data: { currentVersionId: publishedVersion.id },
      });

      await logTemplateAction(tx, {
        templateId: template.id,
        companyId,
        versionId: publishedVersion.id,
        action: "PUBLISHED",
        actorId: user.userId,
        previousData: previouslyActive
          ? { supersededVersionId: previouslyActive.id }
          : undefined,
        newData: {
          status: "ACTIVE",
          versionNumber: publishedVersion.versionNumber,
        },
      });

      return publishedVersion;
    });

    return withCors(
      ApiResponse.success(result, "Template published successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
