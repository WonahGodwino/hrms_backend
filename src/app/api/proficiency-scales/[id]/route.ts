import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

async function loadScaleWithAccess(
  user: { userId: string; email: string; role: string },
  id: string,
) {
  const scale = await prisma.proficiencyScale.findUnique({ where: { id } });
  if (!scale) return { scale: null, hasAccess: false };
  const hasAccess = await verifyCompanyAccess(user, scale.companyId);
  return { scale, hasAccess };
}

// GET /api/proficiency-scales/:id
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
    const user = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER",
      "STAFF",
    ]);

    const { scale, hasAccess } = await loadScaleWithAccess(user, params.id);
    if (!scale)
      return withCors(
        ApiResponse.notFound("Proficiency scale not found"),
        origin,
      );
    if (!hasAccess)
      return withCors(
        ApiResponse.forbidden("No access to this company"),
        origin,
      );

    const full = await prisma.proficiencyScale.findUnique({
      where: { id: params.id },
      include: { levels: { orderBy: { displayOrder: "asc" } } },
    });

    return withCors(
      ApiResponse.success(full, "Proficiency scale fetched successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// PUT /api/proficiency-scales/:id
// Bulk-syncs levels to match the modal's edit-in-place + single "Save Scales" behavior:
// existing levels are updated, new ones (no id) are created, removed ones are deleted.
export async function PUT(
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
    const body = await request.json();
    const { name, description, isDefault, levels } = body;

    if (!Array.isArray(levels) || levels.length < 2) {
      return withCors(
        ApiResponse.error("A scale requires at least 2 levels", 400),
        origin,
      );
    }

    const seenValues = new Set<number>();
    for (const lvl of levels) {
      if (!lvl.name?.trim()) {
        return withCors(
          ApiResponse.error("Each level requires a name", 400),
          origin,
        );
      }
      if (typeof lvl.value !== "number") {
        return withCors(
          ApiResponse.error("Each level requires a numeric value", 400),
          origin,
        );
      }
      if (seenValues.has(lvl.value)) {
        return withCors(
          ApiResponse.error(`Duplicate level value: ${lvl.value}`, 400),
          origin,
        );
      }
      seenValues.add(lvl.value);
    }

    const { scale, hasAccess } = await loadScaleWithAccess(user, params.id);
    if (!scale)
      return withCors(
        ApiResponse.notFound("Proficiency scale not found"),
        origin,
      );
    if (!hasAccess)
      return withCors(
        ApiResponse.forbidden("No access to this company"),
        origin,
      );

    // A company must always keep a default scale. Demoting the current default
    // directly would leave competencies without their own scale unresolvable.
    if (scale.isDefault && isDefault === false) {
      return withCors(
        ApiResponse.error(
          "Cannot unset the default scale directly. Set another scale as default instead.",
          400,
        ),
        origin,
      );
    }

    // Role/department targets store the numeric level VALUE, so any change to what a
    // value means (a level deleted, or an existing level moved to a different value)
    // would silently change those targets. Compare by level id, not by the value set.
    const currentLevels = await prisma.proficiencyLevel.findMany({
      where: { scaleId: scale.id },
      select: { id: true, level: true },
    });
    const incomingValueById = new Map<string, number>(
      levels
        .filter((l: any) => l.id)
        .map((l: any): [string, number] => [l.id, l.value]),
    );
    const atRiskValues = [
      ...new Set(
        currentLevels
          .filter((cur) => incomingValueById.get(cur.id) !== cur.level) // deleted or renumbered
          .map((cur) => cur.level),
      ),
    ];

    if (atRiskValues.length > 0) {
      // Competencies that resolve to this scale (archived ones are read-only, so they don't block)
      const competencyFilter = {
        companyId: scale.companyId,
        status: { not: "ARCHIVED" as const },
        OR: [
          { scaleId: scale.id },
          ...(scale.isDefault ? [{ scaleId: null }] : []),
        ],
      };

      const [roleUse, deptUse] = await Promise.all([
        prisma.competencyRoleMapping.findMany({
          where: {
            requiredLevel: { in: atRiskValues },
            competency: competencyFilter,
          },
          select: { requiredLevel: true },
          distinct: ["requiredLevel"],
        }),
        prisma.competencyDepartmentMapping.findMany({
          where: {
            requiredLevel: { in: atRiskValues },
            competency: competencyFilter,
          },
          select: { requiredLevel: true },
          distinct: ["requiredLevel"],
        }),
      ]);

      const inUse = [
        ...new Set(
          [...roleUse, ...deptUse].map((r) => r.requiredLevel as number),
        ),
      ].sort((a, b) => a - b);

      if (inUse.length > 0) {
        return withCors(
          ApiResponse.error(
            `Cannot remove or renumber level value${inUse.length === 1 ? "" : "s"} ${inUse.join(", ")}: still used as target levels in role or department mappings. Update those targets first.`,
            409,
          ),
          origin,
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.proficiencyScale.updateMany({
          where: {
            companyId: scale.companyId,
            isDefault: true,
            NOT: { id: scale.id },
          },
          data: { isDefault: false },
        });
      }

      const existingLevels = await tx.proficiencyLevel.findMany({
        where: { scaleId: scale.id },
        select: { id: true },
      });
      const existingIds = new Set(existingLevels.map((l) => l.id));
      const incomingIds = new Set(
        levels.filter((l: any) => l.id).map((l: any) => l.id),
      );

      // Delete levels removed in the UI. If any are referenced by a
      // CompetencyBenchmark, this will throw (FK restrict) — caught below.
      const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
      if (toDelete.length > 0) {
        await tx.proficiencyLevel.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        if (lvl.id && existingIds.has(lvl.id)) {
          await tx.proficiencyLevel.update({
            where: { id: lvl.id },
            data: {
              level: lvl.value,
              name: lvl.name,
              description: lvl.description || null,
              displayOrder: i,
            },
          });
        } else {
          await tx.proficiencyLevel.create({
            data: {
              scaleId: scale.id,
              level: lvl.value,
              name: lvl.name,
              description: lvl.description || null,
              displayOrder: i,
            },
          });
        }
      }

      return tx.proficiencyScale.update({
        where: { id: scale.id },
        data: {
          name: name ?? scale.name,
          description: description ?? scale.description,
          isDefault: isDefault ?? scale.isDefault,
        },
        include: { levels: { orderBy: { displayOrder: "asc" } } },
      });
    });

    return withCors(
      ApiResponse.success(updated, "Proficiency scale updated successfully"),
      origin,
    );
  } catch (error) {
    // Deleting a level still referenced by CompetencyBenchmark hits Prisma's FK
    // restrict error (P2003/P2014) — surface that as a clear 409, not a 500.
    if ((error as any)?.code === "P2003" || (error as any)?.code === "P2014") {
      return withCors(
        ApiResponse.error(
          "Cannot remove a level that is still used by an existing competency benchmark",
          409,
        ),
        origin,
      );
    }
    return withCors(handleApiError(error), origin);
  }
}

// DELETE /api/proficiency-scales/:id  (soft delete — archives, doesn't drop data)
export async function DELETE(
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

    const { scale, hasAccess } = await loadScaleWithAccess(user, params.id);
    if (!scale)
      return withCors(
        ApiResponse.notFound("Proficiency scale not found"),
        origin,
      );
    if (!hasAccess)
      return withCors(
        ApiResponse.forbidden("No access to this company"),
        origin,
      );

    if (scale.isDefault) {
      return withCors(
        ApiResponse.error(
          "Cannot archive the default scale — set another scale as default first",
          400,
        ),
        origin,
      );
    }

    const inUse = await prisma.competency.findMany({
      where: {
        scaleId: params.id,
        companyId: scale.companyId,
        status: { not: "ARCHIVED" },
      },
      select: { name: true },
      take: 3,
    });

    if (inUse.length > 0) {
      const total = await prisma.competency.count({
        where: {
          scaleId: params.id,
          companyId: scale.companyId,
          status: { not: "ARCHIVED" },
        },
      });
      const names = inUse.map((c) => `"${c.name}"`).join(", ");
      return withCors(
        ApiResponse.error(
          `Cannot archive this scale: ${total} competenc${total === 1 ? "y uses" : "ies use"} it (${names}${total > inUse.length ? ", ..." : ""}). Reassign them to another scale first.`,
          409,
        ),
        origin,
      );
    }

    const [templateQuestionCount, bankItemCount] = await Promise.all([
      prisma.templateQuestion.count({
        where: { proficiencyScaleId: params.id },
      }),
      prisma.questionBankItem.count({
        where: {
          proficiencyScaleId: params.id,
          companyId: scale.companyId,
          isActive: true,
        },
      }),
    ]);

    if (templateQuestionCount > 0 || bankItemCount > 0) {
      const parts: string[] = [];
      if (templateQuestionCount > 0) {
        parts.push(
          `${templateQuestionCount} template question${templateQuestionCount === 1 ? "" : "s"}`,
        );
      }
      if (bankItemCount > 0) {
        parts.push(
          `${bankItemCount} question bank item${bankItemCount === 1 ? "" : "s"}`,
        );
      }
      return withCors(
        ApiResponse.error(
          `Cannot archive this scale: it is still used by ${parts.join(" and ")}. Reassign them to another scale first.`,
          409,
        ),
        origin,
      );
    }

    await prisma.proficiencyScale.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    return withCors(
      ApiResponse.success(null, "Proficiency scale archived successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
