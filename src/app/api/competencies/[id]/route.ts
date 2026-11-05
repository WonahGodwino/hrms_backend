import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import {
  logCompetencyAction,
  VALID_CATEGORIES,
  VALID_STATUSES,
  findCompanyScale,
  resolveScaleForCompetency,
  buildBenchmarkData,
} from "@/app/lib/competencies/competency-utils";
import { CompetencyCategory, CompetencyStatus } from "@prisma/client";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

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
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);
    const { id } = params;
    const body = await request.json();

    const existing = await prisma.competency.findUnique({
      where: { id },
      include: { benchmarks: true },
    });

    if (!existing) {
      return withCors(ApiResponse.error("Competency not found", 404), origin);
    }

    const hasAccess = await verifyCompanyAccess(user, existing.companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    if (existing.status === "ARCHIVED") {
      return withCors(
        ApiResponse.error("Cannot edit an archived competency", 400),
        origin,
      );
    }

    const {
      name,
      description,
      category,
      customCategory,
      tags,
      status,
      benchmarks,
      scaleId,
      isLeadership,
    } = body;

    const updateData: any = {};

    if (description !== undefined) {
      updateData.description =
        typeof description === "string" ? description.trim() || null : null;
    }

    if (isLeadership !== undefined) {
      if (typeof isLeadership !== "boolean")
        return withCors(
          ApiResponse.error("isLeadership must be a boolean", 400),
          origin,
        );
      updateData.isLeadership = isLeadership;
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return withCors(ApiResponse.error("name cannot be empty", 400), origin);
      }

      const existingByName = await prisma.competency.findFirst({
        where: {
          companyId: existing.companyId,
          name: { equals: name, mode: "insensitive" },
          status: { not: "ARCHIVED" },
          id: { not: id },
        },
      });
      if (existingByName) {
        return withCors(
          ApiResponse.error("A competency with this name already exists", 400),
          origin,
        );
      }
      updateData.name = name.trim();
    }

    if (category !== undefined) {
      const normalizedCategory = String(
        category,
      ).toUpperCase() as CompetencyCategory;
      if (!VALID_CATEGORIES.includes(normalizedCategory)) {
        return withCors(
          ApiResponse.error(
            `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
      if (normalizedCategory === "OTHER" && !customCategory?.trim()) {
        return withCors(
          ApiResponse.error(
            "customCategory is required when category is OTHER",
            400,
          ),
          origin,
        );
      }
      updateData.category = normalizedCategory;
      updateData.customCategory =
        normalizedCategory === "OTHER" ? customCategory : null;
    }

    if (tags !== undefined) {
      updateData.tags = tags || null;
    }

    if (status !== undefined) {
      const normalizedStatus = String(status).toUpperCase() as CompetencyStatus;
      if (!VALID_STATUSES.includes(normalizedStatus)) {
        return withCors(
          ApiResponse.error(
            `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
      updateData.status = normalizedStatus;
    }

    const effectiveScaleId =
      scaleId !== undefined ? scaleId || null : existing.scaleId;

    if (scaleId !== undefined) {
      if (scaleId) {
        const own = await findCompanyScale(prisma, existing.companyId, scaleId);
        if (!own) {
          return withCors(
            ApiResponse.error(
              "Invalid proficiency scale for this company",
              400,
            ),
            origin,
          );
        }
      }
      updateData.scaleId = scaleId || null;
    }

    const scale = await resolveScaleForCompetency(prisma, {
      companyId: existing.companyId,
      scaleId: effectiveScaleId,
    });

    // Changing the scale without resending benchmarks would leave levels from the old scale
    if (
      scaleId !== undefined &&
      scaleId !== existing.scaleId &&
      benchmarks === undefined &&
      existing.benchmarks.some((b) => b.levelId)
    ) {
      return withCors(
        ApiResponse.error(
          "Changing the proficiency scale requires re-selecting benchmark levels",
          400,
        ),
        origin,
      );
    }

    let benchmarkRows: ReturnType<typeof buildBenchmarkData> | null = null;
    if (benchmarks !== undefined) {
      benchmarkRows = buildBenchmarkData(
        Array.isArray(benchmarks) ? benchmarks : [],
        scale,
      );
      if ("error" in benchmarkRows) {
        return withCors(ApiResponse.error(benchmarkRows.error, 400), origin);
      }
    }

    const competency = await prisma.$transaction(async (tx) => {
      const updated = await tx.competency.update({
        where: { id },
        data: {
          ...updateData,
          ...(benchmarkRows &&
            "data" in benchmarkRows && {
              benchmarks: { deleteMany: {}, create: benchmarkRows.data },
            }),
        },
        include: { benchmarks: true },
      });

      await logCompetencyAction(tx, {
        competencyId: id,
        companyId: existing.companyId,
        action: "UPDATED",
        actorId: user.userId,
        previousData: existing,
        newData: updated,
      });

      return updated;
    });

    return withCors(
      ApiResponse.success(competency, "Competency updated successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
