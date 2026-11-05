import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { TemplateType } from "@prisma/client";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  logTemplateAction,
  VALID_TEMPLATE_TYPES,
  VALID_AUDIENCE_TYPES,
} from "@/app/lib/review-templates/review-template-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/review-templates/:id?companyId=...
// Returns the template + currentVersion, with sections/questions/options/
// audienceScopes nested — the full shape FormBuilderModal and
// TemplateDetailDrawer need to render without follow-up calls.
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
    include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        currentVersion: {
        include: {
            sections: {
            orderBy: { displayOrder: "asc" },
            include: {
                questions: {
                orderBy: { displayOrder: "asc" },
                include: { options: { orderBy: { displayOrder: "asc" } } },
                },
            },
            },
            audienceScopes: true,
        },
        },
    },
    });

    if (!template) {
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );
    }

    return withCors(
      ApiResponse.success(template, "Template retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// (OPTIONS/GET already exist in this file from earlier — PATCH added alongside them)

// ---------------------------------------------------------------------------
// PATCH /api/review-templates/:id
// body: { companyId, name?, type?, customType?, audienceTypes? }
// Updates template identity fields and the current version's audience scope.
// Does NOT touch sections/questions/weights — that's PATCH .../versions/:versionId.
// Does NOT change version status — editing metadata on an ACTIVE template does
// not trigger copy-on-write, since name/type/audience aren't versioned content,
// they're template-level identity. Only section/question edits are versioned.
// ---------------------------------------------------------------------------
export async function PATCH(
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

    const { companyId, name, type, customType, description, audienceTypes } = body as {
      companyId: string;
      name?: string;
      type?: string;
      customType?: string;
      description?: string;
      audienceTypes?: string[];
    };

    if (!companyId) {
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
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
      include: { currentVersion: { include: { audienceScopes: true } } },
    });
    if (!template) {
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );
    }

    let normalizedType: TemplateType | undefined;
    if (type) {
      normalizedType = type.toUpperCase() as TemplateType;
      if (!VALID_TEMPLATE_TYPES.includes(normalizedType)) {
        return withCors(
          ApiResponse.error(
            `Invalid type. Must be one of: ${VALID_TEMPLATE_TYPES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
      if (normalizedType === "OTHER" && !customType?.trim()) {
        return withCors(
          ApiResponse.error("customType is required when type is OTHER", 400),
          origin,
        );
      }
    }

    let normalizedAudience: string[] | undefined;
    if (audienceTypes) {
      normalizedAudience = audienceTypes.map((a) => a.toUpperCase());
      const invalid = normalizedAudience.find(
        (a) => !VALID_AUDIENCE_TYPES.includes(a as any),
      );
      if (invalid) {
        return withCors(
          ApiResponse.error(`Invalid audience type: ${invalid}`, 400),
          origin,
        );
      }
    }

    if (name && name.trim() !== template.name) {
      const existingByName = await prisma.reviewTemplate.findFirst({
        where: {
          companyId,
          id: { not: template.id },
          name: { equals: name.trim(), mode: "insensitive" },
          currentVersion: { status: { not: "ARCHIVED" } },
        },
      });
      if (existingByName) {
        return withCors(
          ApiResponse.error(
            "A review template with this name already exists",
            400,
          ),
          origin,
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const previousData = {
        name: template.name,
        type: template.type,
        customType: template.customType,
        audienceTypes:
          template.currentVersion?.audienceScopes.map((a) => a.audienceType) ??
          [],
      };

      const updated = await tx.reviewTemplate.update({
        where: { id: template.id },
        data: {
          ...(name ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(normalizedType ? { type: normalizedType } : {}),
          ...(normalizedType
            ? { customType: normalizedType === "OTHER" ? customType : null }
            : {}),
        },
      });

      if (normalizedAudience && template.currentVersion) {
        await tx.templateAudienceScope.deleteMany({
          where: { versionId: template.currentVersion.id },
        });
        await tx.templateAudienceScope.createMany({
          data: normalizedAudience.map((audienceType) => ({
            versionId: template.currentVersion!.id,
            audienceType: audienceType as any,
          })),
        });
      }

      await logTemplateAction(tx, {
        templateId: template.id,
        companyId,
        versionId: template.currentVersionId ?? undefined,
        action: "METADATA_UPDATED",
        actorId: user.userId,
        previousData,
        newData: {
          name: updated.name,
          type: updated.type,
          customType: updated.customType,
          audienceTypes: normalizedAudience,
        },
      });

      return tx.reviewTemplate.findUnique({
        where: { id: template.id },
        include: { currentVersion: { include: { audienceScopes: true } } },
      });
    });

    return withCors(
      ApiResponse.success(result, "Template updated successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
