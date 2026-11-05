import { prisma } from "@/app/lib/db";
import { toDisplayCategory } from "./competency-utils";

const pct = (n: number, d: number) =>
  d > 0 ? Math.round((n / d) * 100) : null;
const ACTIVE = { equals: "Active", mode: "insensitive" as const };

const CATEGORY_ORDER = [
  "CORE",
  "LEADERSHIP",
  "TECHNICAL",
  "BEHAVIORAL",
  "COMPLIANCE",
  "OTHER",
];

// Share of each department's active designations covered per competency category
// (covered = own mapping or inherited from a department mapping), top 3 departments by size.
async function getCoverageHeatmap(companyId: string) {
  const [competencies, departments, designations] = await Promise.all([
    prisma.competency.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { id: true, category: true },
    }),
    prisma.department.findMany({
      where: { companyId, status: ACTIVE },
      select: { id: true, name: true },
    }),
    prisma.designation.findMany({
      where: { companyId, status: ACTIVE },
      select: { id: true, departmentId: true },
    }),
  ]);

  const categoryById = new Map(
    competencies.map((c) => [c.id, c.category as string]),
  );
  const ids = [...categoryById.keys()];

  const [roleMaps, deptMaps] = await Promise.all([
    prisma.competencyRoleMapping.findMany({
      where: { competencyId: { in: ids } },
      select: { competencyId: true, designationId: true },
    }),
    prisma.competencyDepartmentMapping.findMany({
      where: { competencyId: { in: ids } },
      select: { competencyId: true, departmentId: true },
    }),
  ]);

  const add = (m: Map<string, Set<string>>, key: string, cat: string) => {
    if (!m.has(key)) m.set(key, new Set());
    m.get(key)!.add(cat);
  };
  const desigCats = new Map<string, Set<string>>();
  for (const m of roleMaps) {
    const cat = categoryById.get(m.competencyId);
    if (cat) add(desigCats, m.designationId, cat);
  }
  const deptCats = new Map<string, Set<string>>();
  for (const m of deptMaps) {
    const cat = categoryById.get(m.competencyId);
    if (cat) add(deptCats, m.departmentId, cat);
  }

  const presentCategories = CATEGORY_ORDER.filter((c) =>
    competencies.some((x) => x.category === c),
  );

  const rows = departments
    .map((d) => {
      const members = designations.filter((x) => x.departmentId === d.id);
      return {
        department: d.name,
        totalRoles: members.length,
        cells: presentCategories.map((cat) => {
          const covered = members.filter(
            (x) =>
              desigCats.get(x.id)?.has(cat) || deptCats.get(d.id)?.has(cat),
          ).length;
          return {
            category: toDisplayCategory(cat as any),
            percent: pct(covered, members.length),
          };
        }),
      };
    })
    .filter((r) => r.totalRoles > 0)
    .sort((a, b) => b.totalRoles - a.totalRoles)
    .slice(0, 3);

  return {
    columns: presentCategories.map((c) => toDisplayCategory(c as any)),
    rows,
  };
}

export async function getCompetencySummary(companyId: string) {
  const heatmapPromise = getCoverageHeatmap(companyId);
  const [
    statusGroups,
    categoryGroups,
    activeCompetencies,
    activeDepartments,
    activeDesignations,
  ] = await Promise.all([
    prisma.competency.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { _all: true },
    }),
    prisma.competency.groupBy({
      by: ["category"],
      where: { companyId, status: { not: "ARCHIVED" } },
      _count: { _all: true },
    }),
    prisma.competency.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { id: true },
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

  const countOf = (s: string) =>
    statusGroups.find((g) => g.status === s)?._count._all ?? 0;
  const active = countOf("ACTIVE");
  const draft = countOf("DRAFT");
  const archived = countOf("ARCHIVED");
  const total = active + draft; // matches the list's default view (archived hidden)

  const activeIds = activeCompetencies.map((c) => c.id);

  const [usedQuestions, deptMappings, roleMappings] = await Promise.all([
    // Active competencies referenced by a question in a published (ACTIVE) template version
    prisma.templateQuestion.findMany({
      where: {
        competencyId: { in: activeIds },
        section: { version: { status: "ACTIVE" } },
      },
      select: { competencyId: true },
      distinct: ["competencyId"],
    }),
    prisma.competencyDepartmentMapping.findMany({
      where: { competencyId: { in: activeIds } },
      select: { departmentId: true },
      distinct: ["departmentId"],
    }),
    prisma.competencyRoleMapping.findMany({
      where: { competencyId: { in: activeIds } },
      select: { designationId: true },
      distinct: ["designationId"],
    }),
  ]);

  // ---- Appraisal integration ----
  const used = usedQuestions.filter((q) => q.competencyId).length;
  const appraisalIntegration = {
    used,
    total: active,
    percent: pct(used, active),
  };

  // ---- Alignment / adoption sets ----
  const activeDeptIds = new Set(activeDepartments.map((d) => d.id));
  const deptMapped = new Set(
    deptMappings
      .map((d) => d.departmentId)
      .filter((id) => activeDeptIds.has(id)),
  );
  const directSet = new Set(roleMappings.map((r) => r.designationId));

  const directDesignations = activeDesignations.filter((d) =>
    directSet.has(d.id),
  );
  const deptsCoveredViaRoles = new Set(
    directDesignations
      .map((d) => d.departmentId)
      .filter((id): id is string => !!id),
  );

  // ---- Dept adoption ----
  const covered = activeDepartments.filter(
    (d) => deptMapped.has(d.id) || deptsCoveredViaRoles.has(d.id),
  ).length;
  const deptAdoption = {
    covered,
    total: activeDepartments.length,
    percent: pct(covered, activeDepartments.length),
  };

  // ---- Role alignment ----
  const direct = directDesignations.length;
  const viaDepartment = activeDesignations.filter(
    (d) =>
      !directSet.has(d.id) && d.departmentId && deptMapped.has(d.departmentId),
  ).length;
  const totalRoles = activeDesignations.length;
  const aligned = direct + viaDepartment;
  const roleAlignment = {
    totalRoles,
    aligned,
    direct,
    viaDepartment,
    unmapped: totalRoles - aligned,
    percent: pct(aligned, totalRoles),
  };

  // ---- Overall utilization: average of the two available bars ----
  const bars = [appraisalIntegration.percent, deptAdoption.percent].filter(
    (p): p is number => p !== null,
  );
  const overall = bars.length
    ? Math.round(bars.reduce((a, b) => a + b, 0) / bars.length)
    : null;

  // ---- Categories (custom categories roll into "Other", matching the list filter) ----
  const categories = categoryGroups
    .map((g) => ({
      label: toDisplayCategory(g.category),
      count: g._count._all,
      percent: pct(g._count._all, total) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totals: {
      total,
      active,
      draft,
      archived,
      coveragePercent: pct(active, total) ?? 0,
    },
    categories,
    utilization: { overall, appraisalIntegration, deptAdoption },
    roleAlignment,
    coverageHeatmap: await heatmapPromise,
  };
}
