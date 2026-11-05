import { Prisma, ReviewPhaseType, TemplateType } from "@prisma/client";
import {
  PHASE_LABEL,
  ASSIGNABLE_CYCLE_STATUSES,
  eligibleStaffWhere,
  logCycleAction,
} from "./appraisal-cycle-utils";
import { logTemplateAction } from "@/app/lib/review-templates/review-template-utils";

export { ASSIGNABLE_CYCLE_STATUSES };

export class AssignmentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Phases that take their own form. Calibration and HR Validation reuse the Manager Review form.
export const TEMPLATE_PHASES: ReviewPhaseType[] = [
  "SELF_APPRAISAL",
  "MANAGER_REVIEW",
  "PEER_REVIEW",
];

export const TEMPLATE_TYPE_PHASES: Record<TemplateType, ReviewPhaseType[]> = {
  SELF_ASSESSMENT: ["SELF_APPRAISAL"],
  PERFORMANCE_REVIEW: ["SELF_APPRAISAL", "MANAGER_REVIEW"],
  MANAGER_CHECKIN: ["MANAGER_REVIEW"],
  FEEDBACK_360: ["PEER_REVIEW"],
  OTHER: TEMPLATE_PHASES,
};

const TEMPLATE_TYPE_LABEL: Record<TemplateType, string> = {
  PERFORMANCE_REVIEW: "Performance review",
  FEEDBACK_360: "360 feedback",
  SELF_ASSESSMENT: "Self assessment",
  MANAGER_CHECKIN: "Manager check-in",
  OTHER: "Custom",
};

const phaseList = (phases: ReviewPhaseType[]) =>
  phases.map((p) => PHASE_LABEL[p] ?? p).join(", ");
const brief = (items: string[]) =>
  items.length <= 3
    ? items.join(", ")
    : `${items.slice(0, 3).join(", ")} +${items.length - 3} more`;

export const ASSIGNMENT_INCLUDE = {
  version: { select: { id: true, versionNumber: true, status: true } },
  cycle: { select: { id: true, name: true, status: true } },
  departmentScopes: {
    include: { department: { select: { id: true, name: true } } },
  },
  jobLevelScopes: {
    select: { id: true, seniorityBand: true },
  },
} as const;

export function resolveAssignmentPhase(input: {
  templateType: TemplateType;
  requested?: unknown;
  enabledPhases: ReviewPhaseType[];
}): { ok: true; phaseType: ReviewPhaseType } | { ok: false; error: string } {
  const compatible = TEMPLATE_TYPE_PHASES[input.templateType] ?? [];
  const typeLabel =
    TEMPLATE_TYPE_LABEL[input.templateType] ?? String(input.templateType);

  if (input.requested) {
    const phase = String(input.requested).toUpperCase() as ReviewPhaseType;
    if (!TEMPLATE_PHASES.includes(phase)) {
      return {
        ok: false,
        error: PHASE_LABEL[phase]
          ? `${PHASE_LABEL[phase]} uses the Manager Review form, so it doesn't take its own template.`
          : `Unknown review phase: ${input.requested}.`,
      };
    }
    if (!compatible.includes(phase)) {
      return {
        ok: false,
        error: `${typeLabel} templates can be used for: ${phaseList(compatible)}.`,
      };
    }
    if (!input.enabledPhases.includes(phase)) {
      return {
        ok: false,
        error: `${PHASE_LABEL[phase]} isn't enabled on this cycle.`,
      };
    }
    return { ok: true, phaseType: phase };
  }

  // Older clients omit the phase: infer it only when there is exactly one sensible choice.
  const candidates = compatible.filter((p) => input.enabledPhases.includes(p));
  if (candidates.length === 1) return { ok: true, phaseType: candidates[0] };
  if (candidates.length === 0) {
    return {
      ok: false,
      error: `None of this cycle's phases take a ${typeLabel.toLowerCase()} template. It can be used for: ${phaseList(compatible)}.`,
    };
  }
  return {
    ok: false,
    error: `Choose which phase this template is for: ${phaseList(candidates)}.`,
  };
}

export interface AssignmentScope {
  scopeType: string;
  departmentIds: string[];
  seniorityBands: string[];
  gradeLevelIds?: string[];
}

type ScopeRow = {
  scopeType: string;
  departmentScopes: { departmentId: string }[];
  jobLevelScopes: { id?: string; seniorityBand?: string | null; gradeLevelId?: string | null }[];
};

export const toScope = (r: ScopeRow): AssignmentScope => {
  const bands = r.jobLevelScopes
    .map((g) => g.seniorityBand || g.gradeLevelId)
    .filter((b): b is string => !!b);
  return {
    scopeType: r.scopeType,
    departmentIds: r.departmentScopes.map((d) => d.departmentId),
    seniorityBands: bands,
    gradeLevelIds: bands,
  };
};

// Anything that isn't SPECIFIC_DEPARTMENTS means "every department the cycle covers".
export function scopesOverlap(a: AssignmentScope, b: AssignmentScope): boolean {
  const da =
    a.scopeType === "SPECIFIC_DEPARTMENTS" ? new Set(a.departmentIds) : null;
  const db =
    b.scopeType === "SPECIFIC_DEPARTMENTS" ? new Set(b.departmentIds) : null;
  const deptOverlap =
    da === null || db === null || [...da].some((id) => db.has(id));
  if (!deptOverlap) return false;
  const bandsA = a.seniorityBands?.length ? a.seniorityBands : (a.gradeLevelIds ?? []);
  const bandsB = b.seniorityBands?.length ? b.seniorityBands : (b.gradeLevelIds ?? []);
  return (
    bandsA.length === 0 ||
    bandsB.length === 0 ||
    bandsA.some((g) => bandsB.includes(g))
  );
}

export function describeScope(
  scope: AssignmentScope,
  deptNames: Map<string, string> = new Map(),
) {
  const depts =
    scope.scopeType === "SPECIFIC_DEPARTMENTS"
      ? brief(
          scope.departmentIds.map((id) => deptNames.get(id) ?? "a department"),
        )
      : "all departments";
  const n = scope.seniorityBands?.length ?? scope.gradeLevelIds?.length ?? 0;
  return `${depts} • ${n ? `${n} seniority level${n === 1 ? "" : "s"}` : "all seniority levels"}`;
}

export interface AssignmentSummary {
  id: string;
  templateId: string;
  versionId: string;
  templateName: string;
  versionNumber: number;
  phaseType: ReviewPhaseType | null;
  scopeType: string;
  departmentCount: number;
  gradeLevelCount?: number;
  seniorityBandCount?: number;
}
export interface AssignmentImpactRow extends AssignmentSummary {
  reason: string;
}

// Soft-unassigns and writes both the template-side and cycle-side history rows.
export async function unassignAssignments(
  tx: Prisma.TransactionClient,
  args: {
    assignments: AssignmentSummary[];
    companyId: string;
    cycleId: string;
    actorId: string;
    reason?: string;
  },
) {
  const { assignments, companyId, cycleId, actorId, reason } = args;
  if (assignments.length === 0) return 0;

  const res = await tx.templateAssignment.updateMany({
    where: {
      id: { in: assignments.map((a) => a.id) },
      cycleId,
      status: "ACTIVE",
    },
    data: {
      status: "UNASSIGNED",
      unassignedBy: actorId,
      unassignedAt: new Date(),
    },
  });

  for (const a of assignments) {
    const details = {
      templateId: a.templateId,
      templateName: a.templateName,
      versionNumber: a.versionNumber,
      phaseType: a.phaseType,
      scopeType: a.scopeType,
      departmentCount: a.departmentCount,
      gradeLevelCount: a.gradeLevelCount,
      ...(reason ? { reason } : {}),
    };
    await logTemplateAction(tx, {
      templateId: a.templateId,
      companyId,
      versionId: a.versionId,
      action: "UNASSIGNED",
      actorId,
      previousData: { cycleId, ...details },
    });
    await logCycleAction(tx, {
      cycleId,
      companyId,
      action: "TEMPLATE_UNASSIGNED",
      actorId,
      previousData: details,
    });
  }
  return res.count;
}

// Which active assignments stop making sense if the cycle's scope or phases change?
export async function getAssignmentImpact(
  client: Prisma.TransactionClient,
  cycleId: string,
  next: {
    scopeType: string;
    departmentIds: string[];
    enabledPhases: ReviewPhaseType[];
  },
): Promise<AssignmentImpactRow[]> {
  const rows = await client.templateAssignment.findMany({
    where: { cycleId, status: "ACTIVE" },
    include: {
      template: { select: { name: true } },
      version: { select: { versionNumber: true } },
      departmentScopes: { select: { departmentId: true } },
      jobLevelScopes: { select: { seniorityBand: true } },
    },
  });
  const allowed =
    next.scopeType === "SPECIFIC_DEPARTMENTS"
      ? new Set(next.departmentIds)
      : null;
  const enabled = new Set(next.enabledPhases);

  return rows.flatMap((r) => {
    const reasons: string[] = [];
    if (r.phaseType && !enabled.has(r.phaseType)) {
      reasons.push(
        `${PHASE_LABEL[r.phaseType] ?? r.phaseType} is no longer part of this cycle`,
      );
    }
    if (
      allowed &&
      r.scopeType === "SPECIFIC_DEPARTMENTS" &&
      r.departmentScopes.some((d) => !allowed.has(d.departmentId))
    ) {
      reasons.push("it targets departments outside the cycle's new scope");
    }
    if (reasons.length === 0) return [];
    return [
      {
        id: r.id,
        templateId: r.templateId,
        versionId: r.versionId,
        templateName: r.template.name,
        versionNumber: r.version.versionNumber,
        phaseType: r.phaseType,
        scopeType: r.scopeType,
        departmentCount: r.departmentScopes.length,
        gradeLevelCount: r.jobLevelScopes.length,
        reason: reasons.join(" and "),
      },
    ];
  });
}

export async function getTemplateBlockers(
  client: Prisma.TransactionClient,
  cycle: {
    id: string;
    companyId: string;
    scopeType: string;
    startDate: Date | null;
    minTenureMonths: number;
    departmentScopes: { departmentId: string }[];
    phases: { phaseType: ReviewPhaseType; enabled: boolean }[];
  },
  excludedStaffIds: string[],
): Promise<string[]> {
  const needed = cycle.phases
    .filter((p) => p.enabled && TEMPLATE_PHASES.includes(p.phaseType))
    .map((p) => p.phaseType);
  if (needed.length === 0) return [];

  const [assignments, staffRows] = await Promise.all([
    client.templateAssignment.findMany({
      where: { cycleId: cycle.id, status: "ACTIVE", phaseType: { in: needed } },
      include: {
        template: { select: { name: true } },
        version: { select: { status: true, versionNumber: true } },
        departmentScopes: { select: { departmentId: true } },
        jobLevelScopes: { select: { seniorityBand: true } },
      },
    }),
    client.staffRecord.findMany({
      where: eligibleStaffWhere({
        companyId: cycle.companyId,
        scopeType: cycle.scopeType as any,
        departmentIds: cycle.departmentScopes.map((d) => d.departmentId),
        minTenureMonths: cycle.minTenureMonths,
        startDate: cycle.startDate,
        excludedStaffIds,
      }),
      select: {
        departmentId: true,
        designation: { select: { seniorityBand: true } },
      },
    }),
  ]);

  const staffGroupMap = new Map<
    string,
    { departmentId: string | null; seniorityBand: string | null }
  >();
  for (const s of staffRows) {
    const key = `${s.departmentId ?? ""}:${s.designation?.seniorityBand ?? ""}`;
    if (!staffGroupMap.has(key)) {
      staffGroupMap.set(key, {
        departmentId: s.departmentId,
        seniorityBand: s.designation?.seniorityBand ?? null,
      });
    }
  }
  const staffGroups = Array.from(staffGroupMap.values());

  const blockers: string[] = [];
  const pending: { label: string; groups: typeof staffGroups }[] = [];

  for (const phase of needed) {
    const label = PHASE_LABEL[phase] ?? phase;
    const rows = assignments.filter((a) => a.phaseType === phase);
    if (rows.length === 0) {
      blockers.push(
        `${label} needs a template. Assign one on the Templates step.`,
      );
      continue;
    }
    for (const a of rows.filter((r) => r.version.status !== "ACTIVE")) {
      blockers.push(
        `${a.template.name} v${a.version.versionNumber} (${label}) is no longer the published version. Unassign it and assign the current one.`,
      );
    }
    const live = rows
      .filter((r) => r.version.status === "ACTIVE")
      .map(toResolvable);
    if (live.length === 0) continue;
    // Department AND seniority band: every group of employees must be covered by some assignment.
    const uncovered = staffGroups.filter(
      (g) =>
        !live.some((a) =>
          assignmentCovers(a, g.departmentId, g.seniorityBand),
        ),
    );
    if (uncovered.length > 0) pending.push({ label, groups: uncovered });
  }

  if (pending.length > 0) {
    const shown = pending.flatMap((p) => p.groups.slice(0, 3));
    const deptIds = [
      ...new Set(
        shown.map((g) => g.departmentId).filter((x): x is string => !!x),
      ),
    ];
    const depts = deptIds.length
      ? await client.department.findMany({
          where: { companyId: cycle.companyId, id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptName = new Map(depts.map((d) => [d.id, d.name]));
    const describe = (g: (typeof staffGroups)[number]) =>
      `${g.departmentId ? (deptName.get(g.departmentId) ?? "a department") : "No department"} / ${
        g.seniorityBand ?? "All levels"
      }`;
    for (const p of pending) {
      const extra = p.groups.length > 3 ? ` +${p.groups.length - 3} more` : "";
      blockers.push(
        `${p.label} has no template for ${p.groups.slice(0, 3).map(describe).join(", ")}${extra}.`,
      );
    }
  }
  return blockers;
}

export interface ResolvableAssignment {
  id: string;
  scopeType: string;
  assignedAt: Date;
  departmentIds: Set<string>;
  seniorityBands: Set<string>;
  gradeLevelIds?: Set<string>;
}

export const toResolvable = (r: {
  id: string;
  scopeType: string;
  assignedAt: Date;
  departmentScopes: { departmentId: string }[];
  jobLevelScopes: { seniorityBand?: string | null; gradeLevelId?: string | null }[];
}): ResolvableAssignment => {
  const bands = new Set(
    r.jobLevelScopes
      .map((g) => g.seniorityBand || g.gradeLevelId)
      .filter((b): b is string => !!b),
  );
  return {
    id: r.id,
    scopeType: r.scopeType,
    assignedAt: r.assignedAt,
    departmentIds: new Set(r.departmentScopes.map((d) => d.departmentId)),
    seniorityBands: bands,
    gradeLevelIds: bands,
  };
};

// Anything that isn't SPECIFIC_DEPARTMENTS covers every department the cycle covers (including none).
export function assignmentCovers(
  a: ResolvableAssignment,
  departmentId: string | null,
  seniorityBand: string | null,
) {
  const deptOk =
    a.scopeType !== "SPECIFIC_DEPARTMENTS" ||
    (departmentId !== null && a.departmentIds.has(departmentId));
  const bandSet = a.seniorityBands.size > 0 ? a.seniorityBands : (a.gradeLevelIds ?? new Set());
  const bandOk =
    bandSet.size === 0 ||
    (seniorityBand !== null && bandSet.has(seniorityBand));
  return deptOk && bandOk;
}

// Most specific wins (department-limited, then job-level-limited), then the most recent.
export function resolveAssignment(
  list: ResolvableAssignment[],
  departmentId: string | null,
  seniorityBand: string | null,
) {
  const specificity = (a: ResolvableAssignment) =>
    (a.scopeType === "SPECIFIC_DEPARTMENTS" ? 2 : 0) +
    (a.seniorityBands.size ? 1 : 0);
  return (
    list
      .filter((a) => assignmentCovers(a, departmentId, seniorityBand))
      .sort(
        (a, b) =>
          specificity(b) - specificity(a) ||
          b.assignedAt.getTime() - a.assignedAt.getTime(),
      )[0] ?? null
  );
}