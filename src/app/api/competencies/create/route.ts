import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { CompetencyCategory, CompetencyStatus } from "@prisma/client";
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

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(request: NextRequest) {
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

    const {
      name,
      description,
      category,
      customCategory,
      tags,
      status,
      companyId,
      benchmarks,
      scaleId,
      isLeadership,
    } = body;

    if (!name || !category || !companyId) {
      return withCors(
        ApiResponse.error(
          "Missing required fields: name, category, companyId",
          400,
        ),
        origin,
      );
    }

    if (isLeadership !== undefined && typeof isLeadership !== "boolean")
      return withCors(
        ApiResponse.error("isLeadership must be a boolean", 400),
        origin,
      );

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

    const normalizedStatus = (
      status ? String(status).toUpperCase() : "DRAFT"
    ) as CompetencyStatus;
    if (!VALID_STATUSES.includes(normalizedStatus)) {
      return withCors(
        ApiResponse.error(
          `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
          400,
        ),
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

    let scale = null;
    if (scaleId) {
      scale = await findCompanyScale(prisma, companyId, scaleId);
      if (!scale) {
        return withCors(
          ApiResponse.error("Invalid proficiency scale for this company", 400),
          origin,
        );
      }
    } else {
      scale = await resolveScaleForCompetency(prisma, {
        companyId,
        scaleId: null,
      });
    }

    const benchmarkResult = buildBenchmarkData(
      Array.isArray(benchmarks) ? benchmarks : [],
      scale,
    );
    if ("error" in benchmarkResult) {
      return withCors(ApiResponse.error(benchmarkResult.error, 400), origin);
    }

    const existingByName = await prisma.competency.findFirst({
      where: {
        companyId,
        name: { equals: name, mode: "insensitive" },
        status: { not: "ARCHIVED" },
      },
    });
    if (existingByName) {
      return withCors(
        ApiResponse.error("A competency with this name already exists", 400),
        origin,
      );
    }

    const competency = await prisma.$transaction(async (tx) => {
      const created = await tx.competency.create({
        data: {
          companyId,
          ownerId: user.userId,
          name,
          description:
            typeof description === "string" ? description.trim() || null : null,
          category: normalizedCategory,
          customCategory:
            normalizedCategory === "OTHER" ? customCategory : null,
          tags: tags || null,
          status: normalizedStatus,
          isLeadership: isLeadership === true,
          benchmarks: { create: benchmarkResult.data },
        },
        include: { benchmarks: true },
      });

      await logCompetencyAction(tx, {
        competencyId: created.id,
        companyId,
        action: "CREATED",
        actorId: user.userId,
        newData: created,
      });

      return created;
    });

    // in route.ts
    return withCors(
      ApiResponse.success(competency, "Competency created successfully", 201),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
