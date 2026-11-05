// src/app/api/competencies/[id]/roles/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import {
  logCompetencyAction,
  resolveScaleForCompetency,
} from "@/app/lib/competencies/competency-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

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

    const mappings = await prisma.competencyRoleMapping.findMany({
      where: { competencyId: id },
      select: {
        designationId: true,
        requiredLevel: true,
        designation: {
          select: { title: true, department: { select: { name: true } } },
        },
      },
    });

    const data = mappings.map((m) => ({
      designationId: m.designationId,
      title: m.designation.title,
      department: m.designation.department?.name || "Unassigned",
      requiredLevel: m.requiredLevel,
    }));

    return withCors(
      ApiResponse.success(data, "Role mappings fetched successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
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
    const body = await request.json();
    const { mappings } = body; // expects: [{ designationId: string, requiredLevel?: number | null }]

    if (!Array.isArray(mappings)) {
      return withCors(
        ApiResponse.error(
          "mappings must be an array of { designationId, requiredLevel }",
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

    const scale = await resolveScaleForCompetency(prisma, competency);
    const allowedLevels = scale
      ? new Set(scale.levels.map((l) => l.level))
      : null;

    // Validate and normalize each entry
    const seen = new Set<string>();
    const normalized: {
      designationId: string;
      requiredLevel: number | null;
    }[] = [];

    for (const entry of mappings) {
      if (
        !entry ||
        typeof entry.designationId !== "string" ||
        entry.designationId.trim() === ""
      ) {
        return withCors(
          ApiResponse.error(
            "Each mapping must include a valid designationId",
            400,
          ),
          origin,
        );
      }
      if (seen.has(entry.designationId)) continue; // silently dedupe repeated designationIds
      seen.add(entry.designationId);

      let requiredLevel: number | null = null;
      if (
        entry.requiredLevel !== undefined &&
        entry.requiredLevel !== null &&
        entry.requiredLevel !== ""
      ) {
        const parsed = Number(entry.requiredLevel);
        if (!Number.isInteger(parsed) || parsed < 1) {
          return withCors(
            ApiResponse.error(
              `Invalid requiredLevel for designationId ${entry.designationId}: must be a positive integer`,
              400,
            ),
            origin,
          );
        }

        if (allowedLevels && !allowedLevels.has(parsed)) {
          return withCors(
            ApiResponse.error(
              `requiredLevel ${parsed} is not a level in the "${scale!.name}" scale (allowed: ${[...allowedLevels].sort((a, b) => a - b).join(", ")})`,
              400,
            ),
            origin,
          );
        }

        requiredLevel = parsed;
      }

      normalized.push({ designationId: entry.designationId, requiredLevel });
    }

    // Validate every designationId actually belongs to this competency's company
    if (normalized.length > 0) {
      const validCount = await prisma.designation.count({
        where: {
          id: { in: normalized.map((n) => n.designationId) },
          companyId: competency.companyId,
        },
      });
      if (validCount !== normalized.length) {
        return withCors(
          ApiResponse.error(
            "One or more designationIds are invalid for this company",
            400,
          ),
          origin,
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.competencyRoleMapping.deleteMany({
        where: { competencyId: id },
      });

      const created = await tx.competencyRoleMapping.createMany({
        data: normalized.map((n) => ({
          competencyId: id,
          designationId: n.designationId,
          requiredLevel: n.requiredLevel,
        })),
      });

      await logCompetencyAction(tx, {
        competencyId: id,
        companyId: competency.companyId,
        action: "ROLES_UPDATED",
        actorId: user.userId,
        newData: { mappings: normalized },
      });

      return created;
    });

    return withCors(
      ApiResponse.success(
        { count: result.count, mappings: normalized },
        "Role mappings saved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
