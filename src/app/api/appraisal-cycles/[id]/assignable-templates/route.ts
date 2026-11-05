import { NextRequest } from "next/server";
import { ReviewPhaseType } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  TEMPLATE_PHASES,
  TEMPLATE_TYPE_PHASES,
} from "@/app/lib/appraisal-cycles/cycle-assignments";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// GET /api/appraisal-cycles/:id/assignable-templates?companyId=&phaseType=
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const origin = request.headers.get("origin");
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader)
      return withCors(
        ApiResponse.error("Authorization header missing", 401),
        origin,
      );
    const token = authHeader.replace("Bearer ", "");
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const phaseParam = searchParams.get("phaseType")?.toUpperCase() as
      | ReviewPhaseType
      | undefined;
    if (!companyId)
      return withCors(
        ApiResponse.error("Missing required query param: companyId", 400),
        origin,
      );
    if (phaseParam && !TEMPLATE_PHASES.includes(phaseParam)) {
      return withCors(
        ApiResponse.error(
          `phaseType must be one of: ${TEMPLATE_PHASES.join(", ")}`,
          400,
        ),
        origin,
      );
    }
    if (!(await verifyCompanyAccess(user, companyId))) {
      return withCors(
        ApiResponse.error("Forbidden: No access to this company", 403),
        origin,
      );
    }

    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, companyId },
      select: { id: true },
    });
    if (!cycle)
      return withCors(
        ApiResponse.notFound("Appraisal cycle not found"),
        origin,
      );

    const templates = await prisma.reviewTemplate.findMany({
      where: { companyId, currentVersion: { status: { not: "ARCHIVED" } } },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    });
    const versions = templates.length
      ? await prisma.reviewTemplateVersion.findMany({
          where: {
            templateId: { in: templates.map((t) => t.id) },
            status: "ACTIVE",
          },
          select: { id: true, templateId: true, versionNumber: true },
        })
      : [];
    const published = new Map(versions.map((v) => [v.templateId, v]));

    const result = templates
      .filter((t) => published.has(t.id))
      .map((t) => {
        const v = published.get(t.id)!;
        return {
          templateId: t.id,
          name: t.name,
          type: t.type,
          versionId: v.id,
          versionNumber: v.versionNumber,
          compatiblePhases: TEMPLATE_TYPE_PHASES[t.type] ?? [],
        };
      })
      .filter((t) => !phaseParam || t.compatiblePhases.includes(phaseParam));

    return withCors(
      ApiResponse.success(
        result,
        "Assignable templates retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
