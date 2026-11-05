import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import { logCompetencyAction } from "@/app/lib/competencies/competency-utils";
import {
  getDuplicateReport,
  orderPair,
  SimilarityError,
} from "@/app/lib/competencies/competency-similarity";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/competencies/governance/duplicates?companyId=xxx&threshold=70&includeDismissed=false
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
    const user = requireRole(token, ["HR", "SUPER_ADMIN", "ADMIN"]);

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

    const report = await getDuplicateReport(
      companyId,
      searchParams.get("threshold"),
      searchParams.get("includeDismissed") === "true",
    );

    return withCors(
      ApiResponse.success(report, "Duplicate candidates fetched successfully"),
      origin,
    );
  } catch (error) {
    if (error instanceof SimilarityError) {
      return withCors(ApiResponse.error(error.message, error.status), origin);
    }
    return withCors(handleApiError(error), origin);
  }
}

// POST /api/competencies/governance/duplicates
// Body: { companyId, action: "dismiss" | "restore", competencyAId, competencyBId }
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
    const { companyId, action, competencyAId, competencyBId } =
      await request.json();

    if (
      !companyId ||
      typeof competencyAId !== "string" ||
      typeof competencyBId !== "string"
    ) {
      return withCors(
        ApiResponse.error(
          "Missing required fields: companyId, competencyAId, competencyBId",
          400,
        ),
        origin,
      );
    }
    if (action !== "dismiss" && action !== "restore") {
      return withCors(
        ApiResponse.error('action must be "dismiss" or "restore"', 400),
        origin,
      );
    }
    if (competencyAId === competencyBId) {
      return withCors(
        ApiResponse.error("A competency cannot be paired with itself", 400),
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

    const [aId, bId] = orderPair(competencyAId, competencyBId);
    const found = await prisma.competency.findMany({
      where: { id: { in: [aId, bId] }, companyId },
      select: { id: true, name: true },
    });
    if (found.length !== 2) {
      return withCors(
        ApiResponse.error(
          "One or both competencies are invalid for this company",
          400,
        ),
        origin,
      );
    }
    const other = found.find((c) => c.id === bId)!;

    await prisma.$transaction(async (tx) => {
      if (action === "dismiss") {
        await tx.competencyDuplicateDismissal.upsert({
          where: {
            competencyAId_competencyBId: {
              competencyAId: aId,
              competencyBId: bId,
            },
          },
          update: {},
          create: {
            companyId,
            competencyAId: aId,
            competencyBId: bId,
            dismissedById: user.userId,
          },
        });
      } else {
        await tx.competencyDuplicateDismissal.deleteMany({
          where: { companyId, competencyAId: aId, competencyBId: bId },
        });
      }

      // One audit entry, recorded on the first competency of the pair
      await logCompetencyAction(tx, {
        competencyId: aId,
        companyId,
        action:
          action === "dismiss" ? "DUPLICATE_DISMISSED" : "DUPLICATE_RESTORED",
        actorId: user.userId,
        newData: { pairedWith: other.name, pairedWithId: bId },
      });
    });

    return withCors(
      ApiResponse.success(
        { action, competencyAId: aId, competencyBId: bId },
        action === "dismiss"
          ? "Marked as not a duplicate"
          : "Duplicate flag restored",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
