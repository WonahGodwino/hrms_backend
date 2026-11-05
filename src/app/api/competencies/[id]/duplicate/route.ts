import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { logCompetencyAction } from "@/app/lib/competencies/competency-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

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
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);
    const { id } = params;

    const source = await prisma.competency.findUnique({
      where: { id },
      include: {
        benchmarks: { orderBy: { displayOrder: "asc" } },
        roleMappings: true,
        departmentMappings: true,
      },
    });

    if (!source) {
      return withCors(ApiResponse.error("Competency not found", 404), origin);
    }

    const hasAccess = await verifyCompanyAccess(user, source.companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    // Find a unique "(Copy)" name — handles repeated duplication of the same source
    let copyName = `${source.name} (Copy)`;
    let suffix = 2;
    while (
      await prisma.competency.findFirst({
        where: {
          companyId: source.companyId,
          name: { equals: copyName, mode: "insensitive" },
          status: { not: "ARCHIVED" },
        },
      })
    ) {
      copyName = `${source.name} (Copy ${suffix})`;
      suffix += 1;
    }

    const duplicate = await prisma.$transaction(async (tx) => {
      const created = await tx.competency.create({
        data: {
          companyId: source.companyId,
          ownerId: user.userId, // duplicate is owned by whoever triggered it, not the original owner
          name: copyName,
          category: source.category,
          customCategory: source.customCategory,
          scaleId: source.scaleId,
          tags: source.tags,
          status: "DRAFT", // duplicates always start as Draft, regardless of source status
          benchmarks: {
            create: source.benchmarks.map((b) => ({
              level: b.level,
              levelId: b.levelId,
              description: b.description,
              behaviors: b.behaviors,
              displayOrder: b.displayOrder,
            })),
          },
          roleMappings: {
            create: source.roleMappings.map((rm) => ({
              designationId: rm.designationId, // was `role: rm.role`, which doesn't exist in the schema
              requiredLevel: rm.requiredLevel,
            })),
          },
          departmentMappings: {
            create: source.departmentMappings.map((dm) => ({
              departmentId: dm.departmentId,
              requiredLevel: dm.requiredLevel,
            })),
          },
        },
        include: { benchmarks: true },
      });

      // Note: intentionally NOT copying source's history — a new DUPLICATED
      // entry is created instead, per the schema design discussed earlier.
      await logCompetencyAction(tx, {
        competencyId: created.id,
        companyId: source.companyId,
        action: "DUPLICATED",
        actorId: user.userId,
        newData: { duplicatedFrom: source.id, name: created.name },
      });

      return created;
    });

    return withCors(
      ApiResponse.success(duplicate, "Competency duplicated successfully", 201),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
