import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import {
  logCompetencyAction,
  resolveScaleForCompetency,
  normalizeLevelMappings,
} from "@/app/lib/competencies/competency-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/competencies/:id/departments
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
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);
    const { id } = params;

    const competency = await prisma.competency.findUnique({ where: { id } });
    if (!competency) {
      return withCors(ApiResponse.error("Competency not found", 404), origin);
    }

    const hasAccess = await verifyCompanyAccess(user, competency.companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const mappings = await prisma.competencyDepartmentMapping.findMany({
      where: { competencyId: id },
      select: {
        departmentId: true,
        requiredLevel: true,
        department: { select: { name: true } },
      },
      orderBy: { department: { name: "asc" } },
    });
    const mappedIds = mappings.map((m) => m.departmentId);

    const [departments, scale] = await Promise.all([
      prisma.department.findMany({
        where: {
          companyId: competency.companyId,
          OR: [
            { status: { equals: "Active", mode: "insensitive" } },
            // keep already-mapped departments visible even if they were deactivated since
            ...(mappedIds.length > 0 ? [{ id: { in: mappedIds } }] : []),
          ],
        },
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
      }),
      resolveScaleForCompetency(prisma, competency),
    ]);

    const data = {
      scale: scale
        ? {
            id: scale.id,
            name: scale.name,
            levels: [...scale.levels]
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((l) => ({ level: l.level, name: l.name })),
          }
        : null,
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        inactive: d.status.toLowerCase() !== "active",
      })),
      mappings: mappings.map((m) => ({
        departmentId: m.departmentId,
        name: m.department.name,
        requiredLevel: m.requiredLevel,
      })),
    };

    return withCors(
      ApiResponse.success(data, "Department mappings fetched successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/competencies/:id/departments
// Replaces the full set of department mappings.
// Body: { mappings: [{ departmentId: string, requiredLevel?: number | null }] }
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
    const body = await request.json();
    const { mappings } = body;

    if (!Array.isArray(mappings)) {
      return withCors(
        ApiResponse.error(
          "mappings must be an array of { departmentId, requiredLevel }",
          400,
        ),
        origin,
      );
    }

    const competency = await prisma.competency.findUnique({ where: { id } });
    if (!competency) {
      return withCors(ApiResponse.error("Competency not found", 404), origin);
    }

    const hasAccess = await verifyCompanyAccess(user, competency.companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    if (competency.status === "ARCHIVED") {
      return withCors(
        ApiResponse.error(
          "Cannot edit mappings of an archived competency",
          400,
        ),
        origin,
      );
    }

    const scale = await resolveScaleForCompetency(prisma, competency);
    const result = normalizeLevelMappings(mappings, "departmentId", scale);
    if ("error" in result) {
      return withCors(ApiResponse.error(result.error, 400), origin);
    }
    const normalized = result.data.map((m) => ({
      departmentId: m.id,
      requiredLevel: m.requiredLevel,
    }));

    // Every departmentId must belong to this competency's company
    if (normalized.length > 0) {
      const ids = normalized.map((n) => n.departmentId);

      const [found, existingMappings] = await Promise.all([
        prisma.department.findMany({
          where: { id: { in: ids }, companyId: competency.companyId },
          select: { id: true, status: true },
        }),
        prisma.competencyDepartmentMapping.findMany({
          where: { competencyId: id },
          select: { departmentId: true },
        }),
      ]);

      if (found.length !== ids.length) {
        return withCors(
          ApiResponse.error(
            "One or more departmentIds are invalid for this company",
            400,
          ),
          origin,
        );
      }

      // Existing mappings to a since-deactivated department may stay,
      // but inactive departments can't be newly mapped.
      const alreadyMapped = new Set(
        existingMappings.map((m) => m.departmentId),
      );
      const newlyInactive = found.filter(
        (d) => d.status.toLowerCase() !== "active" && !alreadyMapped.has(d.id),
      );
      if (newlyInactive.length > 0) {
        return withCors(
          ApiResponse.error("Inactive departments cannot be newly mapped", 400),
          origin,
        );
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      const previous = await tx.competencyDepartmentMapping.findMany({
        where: { competencyId: id },
        select: { departmentId: true, requiredLevel: true },
      });

      await tx.competencyDepartmentMapping.deleteMany({
        where: { competencyId: id },
      });

      const created = await tx.competencyDepartmentMapping.createMany({
        data: normalized.map((n) => ({ competencyId: id, ...n })),
      });

      await logCompetencyAction(tx, {
        competencyId: id,
        companyId: competency.companyId,
        action: "DEPARTMENTS_UPDATED",
        actorId: user.userId,
        previousData: { mappings: previous },
        newData: { mappings: normalized },
      });

      return created;
    });

    return withCors(
      ApiResponse.success(
        { count: saved.count, mappings: normalized },
        "Department mappings saved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
