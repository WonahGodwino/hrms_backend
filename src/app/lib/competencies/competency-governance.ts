import { prisma } from "@/app/lib/db";

export const OUTDATED_AFTER_MONTHS = 18;

const isActiveStatus = (s: string | null | undefined) =>
  (s ?? "").toLowerCase() === "active";

export type IssueType =
  | "UNCOVERED_ROLES"
  | "TEMPLATE_REFERENCES_INACTIVE"
  | "TARGET_NOT_IN_SCALE"
  | "INACTIVE_TARGETS"
  | "MISSING_TARGET_LEVEL"
  | "LEGACY_LEVELS";

export type Severity = "high" | "medium" | "low";

export type GovernanceIssue = {
  type: IssueType;
  severity: Severity;
  competencyId: string;
  competencyName: string;
  message: string;
  count: number;
  samples: string[];
};

const CHECKS = [
  { key: "hasBenchmarks", label: "Has proficiency benchmarks" },
  { key: "levelsLinked", label: "Benchmarks linked to scale levels" },
  { key: "behaviorsDefined", label: "Behavioral indicators defined" },
  { key: "descriptionsDefined", label: "Level descriptions written" },
  { key: "mapped", label: "Mapped to a role or department" },
  {
    key: "reviewedRecently",
    label: `Reviewed within ${OUTDATED_AFTER_MONTHS} months`,
  },
] as const;
type CheckKey = (typeof CHECKS)[number]["key"];

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export async function getGovernanceReport(companyId: string) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - OUTDATED_AFTER_MONTHS);

  const [
    competencies,
    scales,
    departments,
    designations,
    inactiveTemplateRefs,
  ] = await Promise.all([
    prisma.competency.findMany({
      where: { companyId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        category: true,
        scaleId: true,
        createdAt: true,
        lastReviewedAt: true,
        benchmarks: {
          select: { levelId: true, description: true, behaviors: true },
        },
        roleMappings: { select: { designationId: true, requiredLevel: true } },
        departmentMappings: {
          select: { departmentId: true, requiredLevel: true },
        },
      },
    }),
    prisma.proficiencyScale.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        isDefault: true,
        levels: { select: { level: true } },
      },
    }),
    prisma.department.findMany({
      where: { companyId },
      select: { id: true, name: true, status: true },
    }),
    prisma.designation.findMany({
      where: { companyId },
      select: { id: true, title: true, status: true, departmentId: true },
    }),
    // Active template versions rating a competency that is no longer ACTIVE
    prisma.templateQuestion.findMany({
      where: {
        competency: { companyId, status: { in: ["DRAFT", "ARCHIVED"] } },
        section: { version: { status: "ACTIVE" } },
      },
      select: {
        competencyId: true,
        competency: { select: { name: true, status: true } },
        section: {
          select: {
            version: { select: { template: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const defaultScale = scales.find((s) => s.isDefault) ?? null;
  const designationById = new Map(designations.map((d) => [d.id, d]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const activeDesignations = designations.filter((d) =>
    isActiveStatus(d.status),
  );
  const activeDeptIds = new Set(
    departments.filter((d) => isActiveStatus(d.status)).map((d) => d.id),
  );

  const tally = new Map<CheckKey, { passed: number; applicable: number }>(
    CHECKS.map((c) => [c.key, { passed: 0, applicable: 0 }]),
  );
  let fullyHealthy = 0;
  let complianceCompetencies = 0;
  const outdatedItems: {
    competencyId: string;
    name: string;
    lastReviewedAt: Date | null;
    referenceDate: Date;
    monthsSince: number;
  }[] = [];
  const issues: GovernanceIssue[] = [];

  const addIssue = (
    type: IssueType,
    severity: Severity,
    c: { id: string; name: string },
    count: number,
    message: string,
    samples: string[] = [],
  ) =>
    issues.push({
      type,
      severity,
      competencyId: c.id,
      competencyName: c.name,
      message,
      count,
      samples: samples.slice(0, 5),
    });

  for (const c of competencies) {
    const scale =
      (c.scaleId ? scales.find((s) => s.id === c.scaleId) : null) ??
      defaultScale;
    const scaleLevels = scale
      ? new Set(scale.levels.map((l) => l.level))
      : null;
    const refDate = c.lastReviewedAt ?? c.createdAt;
    const hasBenchmarks = c.benchmarks.length > 0;

    // ---- Health checks (a check only counts when it applies) ----
    const results: Partial<Record<CheckKey, boolean>> = {
      hasBenchmarks,
      mapped: c.roleMappings.length + c.departmentMappings.length > 0,
      reviewedRecently: refDate >= cutoff,
    };
    if (hasBenchmarks) {
      results.behaviorsDefined = c.benchmarks.every((b) =>
        b.behaviors.some((x) => x.trim() !== ""),
      );
      results.descriptionsDefined = c.benchmarks.every(
        (b) => !!b.description?.trim(),
      );
      if (scale) results.levelsLinked = c.benchmarks.every((b) => !!b.levelId);
    }

    let allPass = true;
    for (const [key, ok] of Object.entries(results) as [CheckKey, boolean][]) {
      const t = tally.get(key)!;
      t.applicable++;
      if (ok) t.passed++;
      else allPass = false;
    }
    if (allPass) fullyHealthy++;

    if (!results.reviewedRecently) {
      outdatedItems.push({
        competencyId: c.id,
        name: c.name,
        lastReviewedAt: c.lastReviewedAt,
        referenceDate: refDate,
        monthsSince: Math.floor(
          (now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
        ),
      });
    }

    // ---- Mapping integrity issues ----
    const targets = [
      ...c.roleMappings.map((m) => ({
        level: m.requiredLevel,
        active: isActiveStatus(designationById.get(m.designationId)?.status),
        label: designationById.get(m.designationId)?.title ?? "Unknown role",
      })),
      ...c.departmentMappings.map((m) => ({
        level: m.requiredLevel,
        active: activeDeptIds.has(m.departmentId),
        label: departmentById.get(m.departmentId)?.name ?? "Unknown department",
      })),
    ];

    const missing = targets.filter((t) => t.level === null);
    if (missing.length > 0) {
      addIssue(
        "MISSING_TARGET_LEVEL",
        "low",
        c,
        missing.length,
        `${missing.length} mapping${missing.length === 1 ? " has" : "s have"} no target level`,
        missing.map((t) => t.label),
      );
    }

    if (scaleLevels) {
      const invalid = targets.filter(
        (t) => t.level !== null && !scaleLevels.has(t.level),
      );
      if (invalid.length > 0) {
        addIssue(
          "TARGET_NOT_IN_SCALE",
          "high",
          c,
          invalid.length,
          `${invalid.length} target level${invalid.length === 1 ? " is" : "s are"} not part of the proficiency scale`,
          invalid.map((t) => `${t.label} (level ${t.level})`),
        );
      }
    }

    const inactive = targets.filter((t) => !t.active);
    if (inactive.length > 0) {
      addIssue(
        "INACTIVE_TARGETS",
        "medium",
        c,
        inactive.length,
        `${inactive.length} mapping${inactive.length === 1 ? " points" : "s point"} at an inactive role or department`,
        inactive.map((t) => t.label),
      );
    }

    if (scale) {
      const legacy = c.benchmarks.filter((b) => !b.levelId).length;
      if (legacy > 0) {
        addIssue(
          "LEGACY_LEVELS",
          "low",
          c,
          legacy,
          `${legacy} benchmark${legacy === 1 ? " is" : "s are"} not linked to a scale level`,
        );
      }
    }

    // ---- Compliance rule: mandatory competencies must cover every active role ----
    if (c.category === "COMPLIANCE") {
      complianceCompetencies++;
      const direct = new Set(c.roleMappings.map((m) => m.designationId));
      const mappedDepts = new Set(
        c.departmentMappings
          .map((m) => m.departmentId)
          .filter((id) => activeDeptIds.has(id)),
      );
      const uncovered = activeDesignations.filter(
        (d) =>
          !direct.has(d.id) &&
          !(d.departmentId && mappedDepts.has(d.departmentId)),
      );
      if (uncovered.length > 0) {
        addIssue(
          "UNCOVERED_ROLES",
          "high",
          c,
          uncovered.length,
          `${uncovered.length} active role${uncovered.length === 1 ? "" : "s"} not covered by this compliance competency`,
          uncovered.map((d) => d.title),
        );
      }
    }
  }

  // ---- Templates rating a competency that is no longer ACTIVE ----
  const refs = new Map<
    string,
    { name: string; status: string; templates: Set<string> }
  >();
  for (const q of inactiveTemplateRefs) {
    if (!q.competencyId || !q.competency) continue;
    if (!refs.has(q.competencyId)) {
      refs.set(q.competencyId, {
        name: q.competency.name,
        status: q.competency.status,
        templates: new Set(),
      });
    }
    refs.get(q.competencyId)!.templates.add(q.section.version.template.name);
  }
  for (const [id, r] of refs) {
    const n = r.templates.size;
    addIssue(
      "TEMPLATE_REFERENCES_INACTIVE",
      "high",
      { id, name: r.name },
      n,
      `Rated in ${n} active template${n === 1 ? "" : "s"} but the competency is ${r.status.toLowerCase()}`,
      [...r.templates],
    );
  }

  issues.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.competencyName.localeCompare(b.competencyName),
  );
  outdatedItems.sort(
    (a, b) => a.referenceDate.getTime() - b.referenceDate.getTime(),
  );

  // ---- Aggregates ----
  const checks = CHECKS.map((c) => {
    const t = tally.get(c.key)!;
    return {
      key: c.key,
      label: c.label,
      passed: t.passed,
      applicable: t.applicable,
      percent:
        t.applicable > 0 ? Math.round((t.passed / t.applicable) * 100) : null,
    };
  });
  const totalPassed = checks.reduce((n, c) => n + c.passed, 0);
  const totalApplicable = checks.reduce((n, c) => n + c.applicable, 0);

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const i of issues) bySeverity[i.severity]++;

  return {
    generatedAt: now,
    totalActive: competencies.length,
    consistency: {
      percent:
        totalApplicable > 0
          ? Math.round((totalPassed / totalApplicable) * 100)
          : null,
      fullyHealthy,
      checks,
    },
    outdated: { thresholdMonths: OUTDATED_AFTER_MONTHS, items: outdatedItems },
    compliance: { competencies: complianceCompetencies, issues, bySeverity },
  };
}
