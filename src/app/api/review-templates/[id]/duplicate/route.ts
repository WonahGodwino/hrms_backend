import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { Prisma } from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { logTemplateAction } from "@/app/lib/review-templates/review-template-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// POST /api/review-templates/:id/duplicate
// body: { companyId }
// Clones currentVersion's sections/questions/options and audienceScopes into
// a brand new ReviewTemplate + DRAFT v1. History is NOT copied — a fresh
// CREATED (via DUPLICATED) entry is logged on the new template instead,
// matching the "don't copy history" rule from the competency duplicate flow.
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
    const { companyId } = body;

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

    const source = await prisma.reviewTemplate.findFirst({
      where: { id: params.id, companyId },
      include: {
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

    if (!source) {
      return withCors(
        ApiResponse.notFound("Review template not found"),
        origin,
      );
    }
    if (!source.currentVersion) {
      return withCors(
        ApiResponse.error("Template has no version content to duplicate", 400),
        origin,
      );
    }

    let copyName = `${source.name} (Copy)`;
    let suffix = 2;
    while (
      await prisma.reviewTemplate.findFirst({
        where: {
          companyId,
          name: { equals: copyName, mode: "insensitive" },
          currentVersion: { status: { not: "ARCHIVED" } },
        },
        select: { id: true },
      })
    ) {
      copyName = `${source.name} (Copy ${suffix})`;
      suffix += 1;
    }

    const result = await prisma.$transaction(async (tx) => {
      const newTemplate = await tx.reviewTemplate.create({
        data: {
          companyId,
          name: copyName,
          description: source.description,
          type: source.type,
          customType: source.customType,
          ownerId: user.userId,
        },
      });

      const newVersion = await tx.reviewTemplateVersion.create({
        data: {
          templateId: newTemplate.id,
          versionNumber: 1,
          status: "DRAFT",
          description: source.currentVersion!.description,
          audienceScopes: {
            create: source.currentVersion!.audienceScopes.map((a) => ({
              audienceType: a.audienceType,
            })),
          },
        },
      });

      for (const section of source.currentVersion!.sections) {
        await tx.templateSection.create({
          data: {
            versionId: newVersion.id,
            title: section.title,
            description: section.description,
            weight: section.weight,
            displayOrder: section.displayOrder,
            questions: {
              create: section.questions.map((q) => ({
                prompt: q.prompt,
                helpText: q.helpText,
                questionType: q.questionType,
                required: q.required,
                displayOrder: q.displayOrder,
                competencyId: q.competencyId,
                proficiencyScaleId: q.proficiencyScaleId,
                bankItemId: q.bankItemId,
                config: (q.config as Prisma.InputJsonValue | null) ?? undefined,
                options: {
                  create: q.options.map((o) => ({
                    label: o.label,
                    value: o.value,
                    displayOrder: o.displayOrder,
                  })),
                },
              })),
            },
          },
        });
      }

      const updatedTemplate = await tx.reviewTemplate.update({
        where: { id: newTemplate.id },
        data: { currentVersionId: newVersion.id },
        include: {
          currentVersion: {
            include: {
              sections: {
                include: { questions: { include: { options: true } } },
              },
              audienceScopes: true,
            },
          },
        },
      });

      await logTemplateAction(tx, {
        templateId: newTemplate.id,
        companyId,
        versionId: newVersion.id,
        action: "DUPLICATED",
        actorId: user.userId,
        previousData: { sourceTemplateId: source.id },
        newData: { name: newTemplate.name },
      });

      return updatedTemplate;
    });

    return withCors(
      ApiResponse.success(result, "Template duplicated successfully", 201),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
