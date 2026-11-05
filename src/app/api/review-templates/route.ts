import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { TemplateType, TemplateVersionStatus } from "@prisma/client";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess, UserContext } from "@/app/lib/access-control";
import {
  logTemplateAction,
  VALID_TEMPLATE_TYPES,
  VALID_VERSION_STATUSES,
  liveDeploymentWhere
} from "@/app/lib/review-templates/review-template-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

// ---------------------------------------------------------------------------
// GET /api/review-templates
// Query params: search, type, status, companyId, page, limit
// Department/job-level/cycle filtering intentionally NOT here — those live on
// TemplateAssignment and are served by /api/review-templates/assignments.
// ---------------------------------------------------------------------------
// app/api/review-templates/route.ts — GET handler, replacing the old query + mapping

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
    const user: UserContext = requireRole(token, [
      "HR",
      "SUPER_ADMIN",
      "ADMIN",
    ]);

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const search = searchParams.get("search")?.trim();
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const departmentId = searchParams.get("departmentId"); // NEW
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
    );

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

    let normalizedType: TemplateType | undefined;
    if (type) {
      normalizedType = type.toUpperCase() as TemplateType;
      if (!VALID_TEMPLATE_TYPES.includes(normalizedType)) {
        return withCors(
          ApiResponse.error(
            `Invalid type. Must be one of: ${VALID_TEMPLATE_TYPES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
    }

    let normalizedStatus: TemplateVersionStatus | undefined;
    if (status) {
      normalizedStatus = status.toUpperCase() as TemplateVersionStatus;
      if (!VALID_VERSION_STATUSES.includes(normalizedStatus)) {
        return withCors(
          ApiResponse.error(
            `Invalid status. Must be one of: ${VALID_VERSION_STATUSES.join(", ")}`,
            400,
          ),
          origin,
        );
      }
    }

    const where: any = {
      companyId,
      ...(normalizedType ? { type: normalizedType } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { customType: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(normalizedStatus
        ? { currentVersion: { status: normalizedStatus } }
        : {}),
      
      ...(departmentId
        ? {
            assignments: {
              some: {
                ...liveDeploymentWhere(),
                OR: [
                  {
                    scopeType: { not: "SPECIFIC_DEPARTMENTS" },
                    cycle: {
                      OR: [
                        { scopeType: "ALL_DEPARTMENTS" },
                        { departmentScopes: { some: { departmentId } } },
                      ],
                    },
                  },
                  {
                    scopeType: "SPECIFIC_DEPARTMENTS",
                    departmentScopes: { some: { departmentId } },
                  },
                ],
              },
            },
          }
        : {}),
    };

    const [templates, total] = await prisma.$transaction([
      prisma.reviewTemplate.findMany({
        where,
        include: {
          currentVersion: {
            include: {
              sections: { select: { id: true, weight: true } },
              audienceScopes: true,
              _count: { select: { sections: true } },
            },
          },
          assignments: {
            where: liveDeploymentWhere(),
            orderBy: { assignedAt: "desc" },
            take: 1,
            include: {
              departmentScopes: {
                include: { department: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reviewTemplate.count({ where }),
    ]);

    const liveGroups = templates.length
      ? await prisma.templateAssignment.groupBy({
          by: ["templateId", "cycleId"],
          where: {
            templateId: { in: templates.map((t) => t.id) },
            ...liveDeploymentWhere(),
          },
          _count: { _all: true },
        })
      : [];
    const liveCount = new Map<string, number>();
    for (const g of liveGroups)
      liveCount.set(g.templateId, (liveCount.get(g.templateId) ?? 0) + 1);

    // Computed fields the table actually renders (sections, questions, scope,
    // usage) — flattened here so the frontend doesn't have to derive them from
    // nested version/assignment data on every render.
    const enriched = await Promise.all(
      templates.map(async (t) => {
        const questionCount = await prisma.templateQuestion.count({
          where: { section: { versionId: t.currentVersionId ?? undefined } },
        });

        const latestAssignment = t.assignments[0];
        let scope = "Unassigned";
        if (latestAssignment) {
          if (latestAssignment.scopeType === "ALL_DEPARTMENTS") {
            scope = "All Departments";
          } else if (latestAssignment.departmentScopes.length) {
            scope = latestAssignment.departmentScopes
              .map((d) => d.department.name)
              .join(", ");
          } else {
            scope = "Custom Group";
          }
        }

        return {
          id: t.id,
          name: t.name,
          type: t.type,
          customType: t.customType,
          description: t.description,
          currentVersionId: t.currentVersionId,
          status: t.currentVersion?.status ?? "DRAFT",
          sections: t.currentVersion?._count.sections ?? 0,
          questions: questionCount,
          audience:
            t.currentVersion?.audienceScopes.map((a) => a.audienceType) ?? [],
          scope,
          usage: liveCount.get(t.id) ?? 0, // live deployments (active assignments on cycles that haven't finished)
          updatedAt: t.updatedAt,
        };
      }),
    );

    return withCors(
      ApiResponse.success(
        { templates: enriched, pagination: { page, limit, total } },
        "Templates retrieved successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/review-templates
// Creates ReviewTemplate + v1 ReviewTemplateVersion (DRAFT), in one transaction.
// ---------------------------------------------------------------------------
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

    const { name, type, customType, description, audienceTypes, companyId } =
      body;

    if (!name || !type || !companyId) {
      return withCors(
        ApiResponse.error(
          "Missing required fields: name, type, companyId",
          400,
        ),
        origin,
      );
    }

    const normalizedType = String(type).toUpperCase() as TemplateType;
    if (!VALID_TEMPLATE_TYPES.includes(normalizedType)) {
      return withCors(
        ApiResponse.error(
          `Invalid type. Must be one of: ${VALID_TEMPLATE_TYPES.join(", ")}`,
          400,
        ),
        origin,
      );
    }

    if (normalizedType === "OTHER" && !customType?.trim()) {
      return withCors(
        ApiResponse.error("customType is required when type is OTHER", 400),
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

    const existingByName = await prisma.reviewTemplate.findFirst({
      where: {
        companyId,
        name: { equals: name, mode: "insensitive" },
        currentVersion: { status: { not: "ARCHIVED" } },
      },
    });
    if (existingByName) {
      return withCors(
        ApiResponse.error(
          "A review template with this name already exists",
          400,
        ),
        origin,
      );
    }

    const validAudienceTypes = [
      "SELF",
      "MANAGER",
      "PEER",
      "SKIP_LEVEL",
      "DIRECT_REPORT",
    ];
    const normalizedAudience: string[] =
      Array.isArray(audienceTypes) && audienceTypes.length
        ? audienceTypes.map((a: string) => String(a).toUpperCase())
        : ["SELF"];

    const invalidAudience = normalizedAudience.find(
      (a) => !validAudienceTypes.includes(a),
    );
    if (invalidAudience) {
      return withCors(
        ApiResponse.error(`Invalid audience type: ${invalidAudience}`, 400),
        origin,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const template = await tx.reviewTemplate.create({
        data: {
          companyId,
          ownerId: user.userId,
          name,
          description: description || null, // moved here from ReviewTemplateVersion
          type: normalizedType,
          customType: normalizedType === "OTHER" ? customType : null,
        },
      });
      const version = await tx.reviewTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: 1,
          status: "DRAFT",
          audienceScopes: {
            create: normalizedAudience.map((audienceType) => ({
              audienceType: audienceType as any,
            })),
          },
        },
      });

      const updated = await tx.reviewTemplate.update({
        where: { id: template.id },
        data: { currentVersionId: version.id },
        include: { currentVersion: { include: { audienceScopes: true } } },
      });

      await logTemplateAction(tx, {
        templateId: template.id,
        companyId,
        versionId: version.id,
        action: "CREATED",
        actorId: user.userId,
        newData: updated,
      });

      return updated;
    });

    return withCors(
      ApiResponse.success(result, "Review template created successfully", 201),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
