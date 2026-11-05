import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { Prisma } from "@prisma/client";
import { QuestionType } from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { VALID_QUESTION_TYPES } from "@/app/lib/review-templates/question-bank-utils";
import {
  normalizeQuestion,
  resolveQuestionLinks,
} from "@/app/lib/review-templates/question-rules";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

const ACTIVE_USE = { section: { version: { status: "ACTIVE" as const } } };

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

    const item = await prisma.questionBankItem.findFirst({
      where: { id: params.id, companyId },
      include: {
        options: { orderBy: { displayOrder: "asc" } },
        competency: { select: { id: true, name: true } },
      },
    });
    if (!item)
      return withCors(
        ApiResponse.notFound("Question bank item not found"),
        origin,
      );

    const uses = await prisma.templateQuestion.findMany({
      where: { bankItemId: item.id, ...ACTIVE_USE },
      select: {
        section: {
          select: {
            version: {
              select: {
                versionNumber: true,
                template: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    const byTemplate = new Map<
      string,
      { templateId: string; templateName: string; versionNumber: number }
    >();
    for (const u of uses) {
      const v = u.section.version;
      byTemplate.set(v.template.id, {
        templateId: v.template.id,
        templateName: v.template.name,
        versionNumber: v.versionNumber,
      });
    }

    return withCors(
      ApiResponse.success(
        { ...item, usedIn: [...byTemplate.values()] },
        "Question bank item retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PATCH: update prompt/type/category/links/options (full options replace)
export async function PATCH(
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
    const body = await request.json();

    const { companyId, category, isActive } = body;
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required field: companyId", 400),
        origin,
      );
    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess)
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );

    const existing = await prisma.questionBankItem.findFirst({
      where: { id: params.id, companyId },
      include: { options: { orderBy: { displayOrder: "asc" } } },
    });
    if (!existing)
      return withCors(
        ApiResponse.notFound("Question bank item not found"),
        origin,
      );

    // Merge the stored item with the incoming changes, then validate the whole thing
    const { value, error } = normalizeQuestion({
      prompt: body.prompt ?? existing.prompt,
      helpText: body.helpText !== undefined ? body.helpText : existing.helpText,
      questionType: body.questionType ?? existing.questionType,
      competencyId:
        body.competencyId !== undefined
          ? body.competencyId
          : existing.competencyId,
      proficiencyScaleId:
        body.proficiencyScaleId !== undefined
          ? body.proficiencyScaleId
          : existing.proficiencyScaleId,
      config: body.config !== undefined ? body.config : existing.config,
      options:
        body.options !== undefined
          ? body.options
          : existing.options.map((o) => ({ label: o.label, value: o.value })),
    });
    if (!value) return withCors(ApiResponse.error(error!, 400), origin);

    const links = await resolveQuestionLinks(companyId, value, {
      allowInactiveCompetencyId: existing.competencyId ?? undefined, // editing text of an item tied to an archived competency is fine
    });
    if ("error" in links)
      return withCors(ApiResponse.error(links.error, 400), origin);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.questionBankOption.deleteMany({
        where: { bankItemId: params.id },
      });
      return tx.questionBankItem.update({
        where: { id: params.id },
        data: {
          prompt: value.prompt,
          questionType: value.questionType,
          helpText: value.helpText,
          ...(category !== undefined ? { category: category || null } : {}),
          ...(typeof isActive === "boolean" ? { isActive } : {}),
          competencyId: value.competencyId,
          proficiencyScaleId: links.proficiencyScaleId,
          config: value.config ?? Prisma.JsonNull,
          options: value.options.length
            ? {
                create: value.options.map((o, i) => ({
                  label: o.label,
                  value: o.value,
                  displayOrder: i,
                })),
              }
            : undefined,
        },
        include: { options: { orderBy: { displayOrder: "asc" } } },
      });
    });

    return withCors(
      ApiResponse.success(updated, "Question bank item updated successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// DELETE: soft delete via isActive, consistent with the codebase's never-hard-delete convention
export async function DELETE(
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

    const existing = await prisma.questionBankItem.findFirst({
      where: { id: params.id, companyId },
    });
    if (!existing)
      return withCors(
        ApiResponse.notFound("Question bank item not found"),
        origin,
      );

    const archived = await prisma.questionBankItem.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    return withCors(
      ApiResponse.success(archived, "Question bank item archived successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
