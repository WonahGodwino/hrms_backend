import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import { validateSectionWeights } from "@/app/lib/review-templates/review-template-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/review-templates/insights?companyId=...
// Company-wide aggregate stats across ACTIVE templates only — backs
// FormArchitecturePreview's "Template Structure Insights" column.
// ---------------------------------------------------------------------------
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

    // Pull every ACTIVE version's sections + question competency links in one
    // pass — everything below is derived from this single query rather than
    // separate round trips, since all four metrics scope to the same set.
    const activeVersions = await prisma.reviewTemplateVersion.findMany({
      where: {
        status: "ACTIVE",
        template: { companyId },
      },
      select: {
        id: true,
        sections: {
          select: {
            weight: true,
            questions: {
              select: {
                competencyId: true,
                competency: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    const activeTemplateCount = activeVersions.length;

    const avgSectionsPerTemplate =
      activeTemplateCount > 0
        ? Number(
            (
              activeVersions.reduce((sum, v) => sum + v.sections.length, 0) /
              activeTemplateCount
            ).toFixed(1),
          )
        : 0;

    let compliantCount = 0;
    for (const version of activeVersions) {
      const { valid } = validateSectionWeights(version.sections);
      if (valid) compliantCount++;
    }

    // Count DISTINCT templates each competency appears in, not raw question
    // count — a competency used 3x in one template should count as 1, not 3,
    // since the metric is "how many templates reuse this competency."
    const competencyTemplateSets = new Map<
      string,
      { name: string; templateIds: Set<string> }
    >();
    for (const version of activeVersions) {
      for (const section of version.sections) {
        for (const q of section.questions) {
          if (q.competencyId && q.competency) {
            const entry = competencyTemplateSets.get(q.competencyId) ?? {
              name: q.competency.name,
              templateIds: new Set<string>(),
            };
            entry.templateIds.add(version.id);
            competencyTemplateSets.set(q.competencyId, entry);
          }
        }
      }
    }

    const mostReusedCompetencies = Array.from(competencyTemplateSets.values())
      .map((entry) => ({
        name: entry.name,
        usedInTemplates: entry.templateIds.size,
      }))
      .sort((a, b) => b.usedInTemplates - a.usedInTemplates)
      .slice(0, 3);

    const result = {
      activeTemplateCount,
      avgSectionsPerTemplate,
      weightingCompliance: {
        compliant: compliantCount,
        total: activeTemplateCount,
      },
      mostReusedCompetencies,
    };

    return withCors(
      ApiResponse.success(result, "Insights retrieved successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
