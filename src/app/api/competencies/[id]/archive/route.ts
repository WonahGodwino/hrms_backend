import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import {
  logCompetencyAction,
  getActiveTemplateImpact,
  templateImpactMessage,
} from "@/app/lib/competencies/competency-utils";

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

    // The body is optional: existing callers send none
    let confirmTemplateImpact = false;
    try {
      const body = await request.json();
      confirmTemplateImpact = body?.confirmTemplateImpact === true;
    } catch {
      /* no body */
    }

    const existing = await prisma.competency.findUnique({ where: { id } });

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
        ApiResponse.error("Competency is already archived", 400),
        origin,
      );
    }

    // Archiving something that live templates still rate needs an explicit confirmation
    const impact = await getActiveTemplateImpact(existing.companyId, id);
    if (impact.count > 0 && !confirmTemplateImpact) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: templateImpactMessage(
              existing.name,
              impact.count,
              impact.names,
            ),
            data: {
              code: "TEMPLATE_IMPACT",
              templateCount: impact.count,
              templates: impact.names,
            },
          },
          { status: 409 },
        ),
        origin,
      );
    }

    const competency = await prisma.$transaction(async (tx) => {
      const updated = await tx.competency.update({
        where: { id },
        data: { status: "ARCHIVED" },
      });

      await logCompetencyAction(tx, {
        competencyId: id,
        companyId: existing.companyId,
        action: "ARCHIVED",
        actorId: user.userId,
        previousData: { status: existing.status },
        newData: {
          status: "ARCHIVED",
          ...(impact.count > 0
            ? { confirmedTemplateImpact: impact.count }
            : {}),
        },
      });

      return updated;
    });

    return withCors(
      ApiResponse.success(competency, "Competency archived successfully"),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
