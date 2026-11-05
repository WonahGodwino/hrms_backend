import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  logTemplateAction,
  isEditableStatus,
} from "@/app/lib/review-templates/review-template-utils";
import {
  normalizeQuestion,
  NormalizedQuestion,
} from "@/app/lib/review-templates/question-rules";
import { resolveScaleForCompetency } from "@/app/lib/competencies/competency-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

interface IncomingSection {
  title: string;
  description?: string;
  weight?: number | null;
  displayOrder?: number;
  questions?: any[];
}

// ---------------------------------------------------------------------------
// PATCH /api/review-templates/:id/versions/:versionId
// Replaces the version's full sections/questions/options tree. An ACTIVE version
// is never mutated: it is cloned into a new DRAFT (copy-on-write) and the template
// is repointed at it. Response always includes { versionChanged, versionId }.
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; versionId: string } },
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

    const { companyId, description, sections } = body as {
      companyId: string;
      description?: string;
      sections: IncomingSection[];
    };

    if (!companyId || !Array.isArray(sections)) {
      return withCors(
        ApiResponse.error("Missing required fields: companyId, sections", 400),
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

    const sourceVersion = await prisma.reviewTemplateVersion.findFirst({
      where: { id: params.versionId, templateId: template.id },
      include: { audienceScopes: true },
    });
    if (!sourceVersion) {
      return withCors(
        ApiResponse.notFound("Version not found on this template"),
        origin,
      );
    }
    if (!isEditableStatus(sourceVersion.status)) {
      return withCors(
        ApiResponse.error(
          `Cannot edit a version with status ${sourceVersion.status}`,
          400,
        ),
        origin,
      );
    }

    const fail = (message: string) =>
      withCors(ApiResponse.error(message, 400), origin);

    // 1. Shape validation of every section and question (no database yet)
    const normalizedSections: {
      title: string;
      description: string | null;
      weight: number | null;
      displayOrder: number;
      questions: NormalizedQuestion[];
    }[] = [];

    for (let si = 0; si < sections.length; si++) {
      const s = sections[si];
      const title = typeof s?.title === "string" ? s.title.trim() : "";
      if (!title) return fail(`Section ${si + 1} needs a title`);

      let weight: number | null = null;
      if (s.weight !== undefined && s.weight !== null) {
        const w = Number(s.weight);
        if (!Number.isFinite(w) || w < 0 || w > 100) {
          return fail(`Section "${title}": weight must be between 0 and 100`);
        }
        weight = Math.round(w);
      }

      const questions: NormalizedQuestion[] = [];
      for (const rawQuestion of s.questions ?? []) {
        const { value, error } = normalizeQuestion(rawQuestion);
        if (!value) return fail(`Section "${title}": ${error}`);
        questions.push(value);
      }

      normalizedSections.push({
        title,
        description: s.description?.trim() || null,
        weight,
        displayOrder: si,
        questions,
      });
    }

    const allQuestions = normalizedSections.flatMap((s) => s.questions);

    // 2. Competency checks: same company, active (unless already in this form), once per form
    const competencyIds = allQuestions
      .map((q) => q.competencyId)
      .filter((id): id is string => !!id);
    const uniqueCompetencyIds = [...new Set(competencyIds)];
    if (uniqueCompetencyIds.length !== competencyIds.length) {
      return fail("The same competency can only be rated once per form");
    }

    const scaleByCompetency = new Map<string, string | null>();
    if (uniqueCompetencyIds.length > 0) {
      const [competencies, existingRefs] = await Promise.all([
        prisma.competency.findMany({
          where: { id: { in: uniqueCompetencyIds } },
          select: {
            id: true,
            name: true,
            companyId: true,
            scaleId: true,
            status: true,
          },
        }),
        prisma.templateQuestion.findMany({
          where: {
            competencyId: { in: uniqueCompetencyIds },
            section: { versionId: sourceVersion.id },
          },
          select: { competencyId: true },
        }),
      ]);

      if (
        competencies.length !== uniqueCompetencyIds.length ||
        competencies.some((c) => c.companyId !== companyId)
      ) {
        return fail(
          "One or more questions reference a competency outside this company",
        );
      }

      const alreadyInForm = new Set(existingRefs.map((r) => r.competencyId));
      const notActive = competencies.find(
        (c) => c.status !== "ACTIVE" && !alreadyInForm.has(c.id),
      );
      if (notActive) {
        return fail(
          `"${notActive.name}" is not an active competency. Publish it in Competency Frameworks before rating it in a form.`,
        );
      }

      // Each competency question takes the competency's own scale (pinned at save time)
      for (const c of competencies) {
        const scale = await resolveScaleForCompetency(prisma, {
          companyId,
          scaleId: c.scaleId,
        });
        scaleByCompetency.set(c.id, scale?.id ?? null);
      }
    }

    // 3. Explicit scales on other questions must exist, be active and belong to this company
    const explicitScaleIds = [
      ...new Set(
        allQuestions
          .filter(
            (q) =>
              q.questionType !== "COMPETENCY_RATING" && q.proficiencyScaleId,
          )
          .map((q) => q.proficiencyScaleId!),
      ),
    ];
    if (explicitScaleIds.length > 0) {
      const found = await prisma.proficiencyScale.count({
        where: { id: { in: explicitScaleIds }, companyId, isActive: true },
      });
      if (found !== explicitScaleIds.length) {
        return fail(
          "One or more questions use a proficiency scale that does not exist or is not active",
        );
      }
    }

    // 4. Bank provenance links must point at this company's bank items
    const bankItemIds = [
      ...new Set(
        allQuestions
          .map((q) => q.bankItemId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (bankItemIds.length > 0) {
      const found = await prisma.questionBankItem.count({
        where: { id: { in: bankItemIds }, companyId },
      });
      if (found !== bankItemIds.length) {
        return fail(
          "One or more questions reference a question bank item outside this company",
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const isCopyOnWrite = sourceVersion.status === "ACTIVE";
      let targetVersionId = sourceVersion.id;

      if (isCopyOnWrite) {
        const latest = await tx.reviewTemplateVersion.findFirst({
          where: { templateId: template.id },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });

        const newVersion = await tx.reviewTemplateVersion.create({
          data: {
            templateId: template.id,
            versionNumber:
              (latest?.versionNumber ?? sourceVersion.versionNumber) + 1,
            status: "DRAFT",
            description: description ?? sourceVersion.description,
            audienceScopes: {
              create: sourceVersion.audienceScopes.map((a) => ({
                audienceType: a.audienceType,
              })),
            },
          },
        });

        targetVersionId = newVersion.id;

        await tx.reviewTemplate.update({
          where: { id: template.id },
          data: { currentVersionId: newVersion.id },
        });
      } else if (description !== undefined) {
        await tx.reviewTemplateVersion.update({
          where: { id: targetVersionId },
          data: { description },
        });
      }

      // Replace the whole tree (cascading deletes clean up questions and options)
      await tx.templateSection.deleteMany({
        where: { versionId: targetVersionId },
      });

      for (const section of normalizedSections) {
        await tx.templateSection.create({
          data: {
            versionId: targetVersionId,
            title: section.title,
            description: section.description,
            weight: section.weight,
            displayOrder: section.displayOrder,
            questions: {
              create: section.questions.map((q, qi) => ({
                prompt: q.prompt,
                helpText: q.helpText,
                questionType: q.questionType,
                required: q.required,
                displayOrder: qi,
                competencyId: q.competencyId,
                proficiencyScaleId:
                  q.questionType === "COMPETENCY_RATING"
                    ? (scaleByCompetency.get(q.competencyId!) ?? null)
                    : q.proficiencyScaleId,
                bankItemId: q.bankItemId,
                config: q.config ?? undefined,
                options: q.options.length
                  ? {
                      create: q.options.map((o, oi) => ({
                        label: o.label,
                        value: o.value,
                        displayOrder: oi,
                      })),
                    }
                  : undefined,
              })),
            },
          },
        });
      }

      await logTemplateAction(tx, {
        templateId: template.id,
        companyId,
        versionId: targetVersionId,
        action: isCopyOnWrite ? "EDITED_VIA_NEW_DRAFT" : "EDITED",
        actorId: user.userId,
        previousData: {
          sourceVersionId: sourceVersion.id,
          sourceStatus: sourceVersion.status,
        },
        newData: {
          sectionCount: normalizedSections.length,
          questionCount: allQuestions.length,
        },
      });

      const finalVersion = await tx.reviewTemplateVersion.findUnique({
        where: { id: targetVersionId },
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
      });

      return {
        versionChanged: isCopyOnWrite,
        versionId: targetVersionId,
        version: finalVersion,
      };
    });

    return withCors(
      ApiResponse.success(result, "Version updated successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
