import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/proficiency-scales?companyId=xxx
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
    const user = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER",
      "STAFF",
    ]);

    const companyId = request.nextUrl.searchParams.get("companyId");
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

    const scales = await prisma.proficiencyScale.findMany({
      where: { companyId, isActive: true },
      include: { levels: { orderBy: { displayOrder: "asc" } } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return withCors(
      ApiResponse.success(scales, "Proficiency scales fetched successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/proficiency-scales
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

    const { name, description, companyId, isDefault, levels } = body;

    if (!name || !companyId) {
      return withCors(
        ApiResponse.error("Missing required fields: name, companyId", 400),
        origin,
      );
    }

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

    const hasAccess = await verifyCompanyAccess(user, companyId);
    if (!hasAccess) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const existingDefault = await prisma.proficiencyScale.count({
      where: { companyId, isDefault: true, isActive: true },
    });
    const makeDefault = !!isDefault || existingDefault === 0;

    const scale = await prisma.$transaction(async (tx) => {
      // Only one default scale per company — demote any existing default first
      if (makeDefault) {
        await tx.proficiencyScale.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.proficiencyScale.create({
        data: {
          companyId,
          name,
          description: description || null,
          isDefault: makeDefault,
          levels: {
            create: levels.map((lvl: any, i: number) => ({
              level: lvl.value,
              name: lvl.name,
              description: lvl.description || null,
              displayOrder: i,
            })),
          },
        },
        include: { levels: { orderBy: { displayOrder: "asc" } } },
      });
    });

    return withCors(
      ApiResponse.success(scale, "Proficiency scale created successfully", 201),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
