import { prisma } from "@/app/lib/db";
import { isClosedCycleStatus } from "./review-template-utils";
import { daysUntilDate } from "../appraisal-cycles/cycle-dates";

export const REVIEW_AFTER_MONTHS = 12;
export const ENDING_SOON_DAYS = 30;
const ALL_AUDIENCES = [
  "SELF",
  "MANAGER",
  "PEER",
  "SKIP_LEVEL",
  "DIRECT_REPORT",
];
const DAY = 24 * 60 * 60 * 1000;
const pct = (n: number, d: number) =>
  d > 0 ? Math.round((n / d) * 100) : null;
const ACTIVE = { equals: "Active", mode: "insensitive" as const };

// "Running" = participants can be filling the form. Other non-closed cycles are upcoming.
const RUNNING_STATUSES = ["ACTIVE", "PAUSED", "ESCALATED"];
// Paused cycles are skipped for ending-soon alerts because their end date moves on resume.
const ENDING_SOON_STATUSES = ["ACTIVE", "ESCALATED"];

type ExpiringItem = {
  templateId: string;
  name: string;
  kind: "CYCLE_CLOSED" | "ENDING_SOON" | "REVIEW_DUE";
  detail: string;
  date: Date | null;
};

export async function getTemplateSummary(companyId: string) {
  const now = new Date();
  const reviewCutoff = new Date(now);
  reviewCutoff.setMonth(reviewCutoff.getMonth() - REVIEW_AFTER_MONTHS);

  const [
    templates,
    activeVersionsRaw,
    draftVersions,
    assignments,
    departments,
    competencies,
    questionsRaw,
  ] = await Promise.all([
    prisma.reviewTemplate.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        currentVersion: { select: { status: true } },
      },
    }),
    prisma.reviewTemplateVersion.findMany({
      where: { status: "ACTIVE", template: { companyId } },
      select: {
        id: true,
        templateId: true,
        publishedAt: true,
        createdAt: true,
        sections: { select: { weight: true } },
        audienceScopes: { select: { audienceType: true } },
      },
    }),
    prisma.reviewTemplateVersion.findMany({
      where: { status: "DRAFT", template: { companyId } },
      select: { templateId: true },
    }),
    prisma.templateAssignment.findMany({
      where: { status: "ACTIVE", template: { companyId } },
      select: {
        templateId: true,
        scopeType: true,
        cycle: {
          select: {
            id: true,
            name: true,
            status: true,
            endDate: true,
            scopeType: true,
            departmentScopes: { select: { departmentId: true } },
          },
        },
        departmentScopes: { select: { departmentId: true } },
      },
    }),
    prisma.department.findMany({
      where: { companyId, status: ACTIVE },
      select: { id: true },
    }),
    prisma.competency.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { id: true },
    }),
    prisma.templateQuestion.findMany({
      where: {
        section: { version: { status: "ACTIVE", template: { companyId } } },
      },
      select: {
        questionType: true,
        competencyId: true,
        competency: { select: { status: true } },
        section: { select: { version: { select: { templateId: true } } } },
      },
    }),
  ]);

  const nameById = new Map(templates.map((t) => [t.id, t.name]));

  // A template whose current version is archived is archived, even if an older
  // published version lingers in legacy data. Keep it out of every published-version stat.
  const archivedIds = new Set(
    templates
      .filter((t) => t.currentVersion?.status === "ARCHIVED")
      .map((t) => t.id),
  );
  const activeVersions = activeVersionsRaw.filter(
    (v) => !archivedIds.has(v.templateId),
  );
  const questions = questionsRaw.filter(
    (q) => !archivedIds.has(q.section.version.templateId),
  );

  const activeByTemplate = new Map(
    activeVersions.map((v) => [v.templateId, v]),
  );
  const draftTemplateIds = new Set(draftVersions.map((v) => v.templateId));

  // ---- Totals ----
  let active = 0;
  let draft = 0;
  let archived = 0;
  for (const t of templates) {
    if (archivedIds.has(t.id)) archived++;
    else if (activeByTemplate.has(t.id)) active++;
    else draft++;
  }
  const pendingPublish = templates.filter(
    (t) => draftTemplateIds.has(t.id) && !archivedIds.has(t.id),
  ).length;

  // ---- Deployments: one per template per cycle, however many phases or scopes it has ----
  const live = assignments.filter((a) => !isClosedCycleStatus(a.cycle.status));
  const liveCyclesByTemplate = new Map<string, Set<string>>();
  const runningPairs = new Set<string>();
  for (const a of live) {
    if (!liveCyclesByTemplate.has(a.templateId)) {
      liveCyclesByTemplate.set(a.templateId, new Set());
    }
    liveCyclesByTemplate.get(a.templateId)!.add(a.cycle.id);
    if (RUNNING_STATUSES.includes(String(a.cycle.status))) {
      runningPairs.add(`${a.templateId}|${a.cycle.id}`);
    }
  }
  const liveDeployments = [...liveCyclesByTemplate.values()].reduce(
    (n, s) => n + s.size,
    0,
  );
  const runningDeployments = runningPairs.size;
  const deployedActive = [...liveCyclesByTemplate.keys()].filter((id) =>
    activeByTemplate.has(id),
  ).length;
  const liveCycleIds = new Set(live.map((a) => a.cycle.id));
  const top = [...liveCyclesByTemplate.entries()]
    .map(([id, cycles]) => [id, cycles.size] as const)
    .sort((a, b) => b[1] - a[1])[0];

  // ---- Coverage ----
  const deptIds = new Set(departments.map((d) => d.id));
  const covered = new Set<string>();
  for (const a of live) {
    // "All departments" means every department the cycle itself covers.
    const ids =
      a.scopeType === "SPECIFIC_DEPARTMENTS"
        ? a.departmentScopes.map((s) => s.departmentId)
        : a.cycle.scopeType === "SPECIFIC_DEPARTMENTS"
          ? a.cycle.departmentScopes.map((s) => s.departmentId)
          : [...deptIds];
    for (const id of ids) if (deptIds.has(id)) covered.add(id);
  }
  const coveredDepartments = covered.size;

  // Same rule as the competency dashboard's Appraisal Integration: active competencies
  // rated by a question in a published version. Keep the two queries in sync.
  const activeCompetencyIds = new Set(competencies.map((c) => c.id));
  const ratedCompetencies = new Set(
    questions
      .filter((q) => q.competencyId && activeCompetencyIds.has(q.competencyId))
      .map((q) => q.competencyId!),
  );

  const typesByTemplate = new Map<string, Set<string>>();
  for (const q of questions) {
    const id = q.section.version.templateId;
    if (!typesByTemplate.has(id)) typesByTemplate.set(id, new Set());
    typesByTemplate.get(id)!.add(q.questionType);
  }
  let competencyBased = 0;
  let goalBased = 0;
  let general = 0;
  for (const id of activeByTemplate.keys()) {
    const types = typesByTemplate.get(id) ?? new Set<string>();
    const c = types.has("COMPETENCY_RATING");
    const g = types.has("GOAL_ASSESSMENT");
    if (c) competencyBased++;
    if (g) goalBased++;
    if (!c && !g) general++;
  }

  const audiencesCovered = ALL_AUDIENCES.filter((a) =>
    activeVersions.some((v) =>
      v.audienceScopes.some((s) => s.audienceType === a),
    ),
  );

  // ---- Governance ----
  const dueForReview = activeVersions.filter(
    (v) => (v.publishedAt ?? v.createdAt) < reviewCutoff,
  );
  const weightsOff = activeVersions.filter(
    (v) => v.sections.reduce((sum, s) => sum + (s.weight ?? 0), 0) !== 100,
  );
  const complianceFlagged = new Set(
    questions
      .filter(
        (q) =>
          q.competencyId && q.competency && q.competency.status !== "ACTIVE",
      )
      .map((q) => q.section.version.templateId),
  );

  // Expired = a published template that has been deployed before but is in no open cycle now.
  // Archived templates are finished, not expiring.
  const templatesWithAssignments = new Set(
    assignments.map((a) => a.templateId),
  );
  const expiredIds = [...templatesWithAssignments].filter(
    (id) => !liveCyclesByTemplate.has(id) && activeByTemplate.has(id),
  );
  const lastClosed = new Map<
    string,
    { name: string; status: string; endDate: Date | null }
  >();
  for (const a of assignments) {
    if (!isClosedCycleStatus(a.cycle.status)) continue;
    const prev = lastClosed.get(a.templateId);
    if (
      !prev ||
      (a.cycle.endDate?.getTime() ?? 0) > (prev.endDate?.getTime() ?? 0)
    ) {
      lastClosed.set(a.templateId, {
        name: a.cycle.name,
        status: String(a.cycle.status),
        endDate: a.cycle.endDate,
      });
    }
  }

  // Ending soon: running cycles only, published templates only, one entry per template per cycle.
  const endingSoonMap = new Map<
    string,
    { templateId: string; cycleName: string; endDate: Date; days: number }
  >();
  for (const a of live) {
    if (
      !activeByTemplate.has(a.templateId) ||
      !a.cycle.endDate ||
      !ENDING_SOON_STATUSES.includes(String(a.cycle.status))
    ) {
      continue;
    }
    const days = daysUntilDate(a.cycle.endDate, now);
    if (days < 0 || days > ENDING_SOON_DAYS) continue;
    endingSoonMap.set(`${a.templateId}|${a.cycle.id}`, {
      templateId: a.templateId,
      cycleName: a.cycle.name,
      endDate: a.cycle.endDate,
      days,
    });
  }
  const endingSoon = [...endingSoonMap.values()];

  const needsUpdate = new Set<string>([
    ...dueForReview.map((v) => v.templateId),
    ...weightsOff.map((v) => v.templateId),
    ...complianceFlagged,
  ]);
  const attention = new Set<string>([
    ...needsUpdate,
    ...expiredIds,
    ...endingSoon.map((e) => e.templateId),
  ]);

  // ---- Expiring list (most urgent first) ----
  const items: ExpiringItem[] = [];
  for (const id of expiredIds) {
    const last = lastClosed.get(id);
    items.push({
      templateId: id,
      name: nameById.get(id) ?? "Template",
      kind: "CYCLE_CLOSED",
      detail: last
        ? `Last used in "${last.name}" (${last.status.toLowerCase()}); not in any open cycle`
        : "Not in any open cycle",
      date: last?.endDate ?? null,
    });
  }
  for (const e of endingSoon) {
    items.push({
      templateId: e.templateId,
      name: nameById.get(e.templateId) ?? "Template",
      kind: "ENDING_SOON",
      detail:
        e.days === 0
          ? `${e.cycleName} ends today`
          : `${e.cycleName} ends in ${e.days} day${e.days === 1 ? "" : "s"}`,
      date: e.endDate,
    });
  }
  for (const v of dueForReview) {
    const ref = v.publishedAt ?? v.createdAt;
    const months = Math.floor((now.getTime() - ref.getTime()) / (DAY * 30.44));
    items.push({
      templateId: v.templateId,
      name: nameById.get(v.templateId) ?? "Template",
      kind: "REVIEW_DUE",
      detail: `Published ${months} months ago`,
      date: ref,
    });
  }
  const rank = { CYCLE_CLOSED: 0, ENDING_SOON: 1, REVIEW_DUE: 2 } as const;
  items.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0),
  );

  return {
    generatedAt: now,
    totals: {
      total: templates.length,
      active,
      draft,
      archived,
      pendingPublish,
    },
    usage: {
      activeDeployments: liveDeployments, // running + upcoming
      runningDeployments,
      upcomingDeployments: liveDeployments - runningDeployments,
      deployedTemplates: deployedActive,
      deploymentRate: pct(deployedActive, active),
      openCycles: liveCycleIds.size,
      mostDeployed: top
        ? {
            id: top[0],
            name: nameById.get(top[0]) ?? "Template",
            count: top[1],
          }
        : null,
    },
    coverage: {
      departments: {
        covered: coveredDepartments,
        total: deptIds.size,
        percent: pct(coveredDepartments, deptIds.size),
      },
      competencies: {
        used: ratedCompetencies.size,
        total: activeCompetencyIds.size,
        percent: pct(ratedCompetencies.size, activeCompetencyIds.size),
      },
      audiences: { covered: audiencesCovered, total: ALL_AUDIENCES.length },
      methodology: {
        competency: competencyBased,
        goal: goalBased,
        general,
        activeTemplates: active,
      },
    },
    governance: {
      pendingPublish,
      dueForReview: dueForReview.length,
      weightsOff: weightsOff.length,
      complianceFlags: complianceFlagged.size,
      expired: expiredIds.length,
      endingSoon: new Set(endingSoon.map((e) => e.templateId)).size,
      needsUpdate: needsUpdate.size,
      attentionTemplates: attention.size,
      thresholds: {
        reviewAfterMonths: REVIEW_AFTER_MONTHS,
        endingSoonDays: ENDING_SOON_DAYS,
      },
    },
    expiring: {
      count: new Set(items.map((i) => i.templateId)).size,
      items: items.slice(0, 10),
    },
  };
}
