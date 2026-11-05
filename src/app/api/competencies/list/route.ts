import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth";
import { ApiResponse, handleApiError } from "@/app/lib/utils";
import { handleCorsOptions, withCors } from "@/app/lib/cors";
import { verifyCompanyAccess } from "@/app/lib/access-control";
import {
  toDisplayCategory,
  toDisplayStatus,
  VALID_CATEGORIES,
  VALID_STATUSES,
} from "@/app/lib/competencies/competency-utils";

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

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

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const search = searchParams.get("search")?.trim() || undefined;
    const categoryParam = searchParams.get("category"); // "All" | "Core" | "Leadership" | etc.
    const statusParam = searchParams.get("status"); // "All" | "Active" | "Draft" | "Archived"

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

    const where: any = { companyId };

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    if (categoryParam && categoryParam !== "All") {
      const normalizedCategory = categoryParam.toUpperCase();
      if (!VALID_CATEGORIES.includes(normalizedCategory as any)) {
        return withCors(
          ApiResponse.error(`Invalid category filter: ${categoryParam}`, 400),
          origin,
        );
      }
      where.category = normalizedCategory;
    }

    if (statusParam && statusParam !== "All") {
      const normalizedStatus = statusParam.toUpperCase();
      if (!VALID_STATUSES.includes(normalizedStatus as any)) {
        return withCors(
          ApiResponse.error(`Invalid status filter: ${statusParam}`, 400),
          origin,
        );
      }
      where.status = normalizedStatus;
    } else {
      // Default view excludes archived unless explicitly filtered for
      where.status = { not: "ARCHIVED" };
    }

    const [competencies, totalCount] = await Promise.all([
      prisma.competency.findMany({
        where,
        // Changed to 'include' to fetch all native fields plus relation data
        include: {
          owner: { select: { firstName: true, lastName: true } },
          scale: { select: { id: true, name: true } },
          benchmarks: {
            orderBy: { displayOrder: "asc" },
            include: { level_rel: { select: { name: true, level: true } } },
          },
          _count: { select: { roleMappings: true, departmentMappings: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.competency.count({ where }),
    ]);

    // Live usage: distinct templates whose ACTIVE version has a question for this competency
    const usageRows = await prisma.templateQuestion.findMany({
      where: {
        competencyId: { in: competencies.map((c) => c.id) },
        section: { version: { status: "ACTIVE", template: { companyId } } },
      },
      select: {
        competencyId: true,
        section: { select: { version: { select: { templateId: true } } } },
      },
    });
    const templatesByCompetency = new Map<string, Set<string>>();
    for (const row of usageRows) {
      if (!row.competencyId) continue;
      if (!templatesByCompetency.has(row.competencyId)) {
        templatesByCompetency.set(row.competencyId, new Set());
      }
      templatesByCompetency
        .get(row.competencyId)!
        .add(row.section.version.templateId);
    }

    // Inherited roles: active designations in a mapped (active) department that have
    // no direct mapping of their own for that competency. Display-only, nothing is stored.
    const competencyIds = competencies.map((c) => c.id);
    const ACTIVE = { equals: "Active", mode: "insensitive" as const };

    const [
      deptMappingRows,
      roleMappingRows,
      activeDepartments,
      activeDesignations,
    ] = await Promise.all([
      prisma.competencyDepartmentMapping.findMany({
        where: { competencyId: { in: competencyIds } },
        select: { competencyId: true, departmentId: true },
      }),
      prisma.competencyRoleMapping.findMany({
        where: { competencyId: { in: competencyIds } },
        select: { competencyId: true, designationId: true },
      }),
      prisma.department.findMany({
        where: { companyId, status: ACTIVE },
        select: { id: true },
      }),
      prisma.designation.findMany({
        where: { companyId, status: ACTIVE },
        select: { id: true, departmentId: true },
      }),
    ]);

    const activeDeptIds = new Set(activeDepartments.map((d) => d.id));

    const designationsByDept = new Map<string, string[]>();
    for (const d of activeDesignations) {
      if (!d.departmentId || !activeDeptIds.has(d.departmentId)) continue;
      if (!designationsByDept.has(d.departmentId))
        designationsByDept.set(d.departmentId, []);
      designationsByDept.get(d.departmentId)!.push(d.id);
    }

    const directByCompetency = new Map<string, Set<string>>();
    for (const m of roleMappingRows) {
      if (!directByCompetency.has(m.competencyId))
        directByCompetency.set(m.competencyId, new Set());
      directByCompetency.get(m.competencyId)!.add(m.designationId);
    }

    const deptsByCompetency = new Map<string, string[]>();
    for (const m of deptMappingRows) {
      if (!activeDeptIds.has(m.departmentId)) continue;
      if (!deptsByCompetency.has(m.competencyId))
        deptsByCompetency.set(m.competencyId, []);
      deptsByCompetency.get(m.competencyId)!.push(m.departmentId);
    }

    const inheritedByCompetency = new Map<string, number>();
    for (const [competencyId, deptIds] of deptsByCompetency) {
      const direct = directByCompetency.get(competencyId);
      let count = 0;
      for (const deptId of deptIds) {
        for (const designationId of designationsByDept.get(deptId) ?? []) {
          if (!direct?.has(designationId)) count++;
        }
      }
      inheritedByCompetency.set(competencyId, count);
    }

    // Spread the original competency object to keep tags, customCategory, and benchmarks intact
    const data = competencies.map((c) => {
      const { _count, ...rest } = c;
      return {
        ...rest,
        category: toDisplayCategory(c.category),
        categoryLabel:
          c.category === "OTHER" && c.customCategory
            ? c.customCategory
            : toDisplayCategory(c.category),
        status: toDisplayStatus(c.status),
        owner: c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : "Unknown",
        benchmarks: c.benchmarks.map(({ level_rel, ...b }) => ({
          ...b,
          level: level_rel?.name ?? b.level, // current frontend keeps working
          levelValue: level_rel?.level ?? null,
        })),
        levels: c.benchmarks
          .map((b) => b.level_rel?.name ?? b.level)
          .filter(Boolean),
        usage: templatesByCompetency.get(c.id)?.size ?? 0,
        roles: _count.roleMappings,
        departments: _count.departmentMappings,
        inheritedRoles: inheritedByCompetency.get(c.id) ?? 0,
      };
    });

    return withCors(
      ApiResponse.success(
        { data, totalCount },
        "Competencies fetched successfully",
      ),
      origin,
    );
  } catch (error) {
    return withCors(handleApiError(error), origin);
  }
}
